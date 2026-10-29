const {chromium}=require('playwright');const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');const root=path.join(__dirname,'..');
function canonical(e){if(!e)return '__DELETED__';if(e.deleted)return '__DELETED__';const f=[e.date,e.text,e.source,(e.tags||[]).slice().sort()];if((e.photos||[]).length||(e.links||[]).length)f.push((e.photos||[]).map(p=>[p.id,p.revision||'']),e.links||[]);return JSON.stringify(f)}
const hash=e=>crypto.createHash('sha256').update(canonical(e)).digest('hex');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.DIARY_CHROME?{executablePath:process.env.DIARY_CHROME}:{})}),context=await browser.newContext({serviceWorkers:'block'}),a=await context.newPage();let remote=[],calls=[],version=0,loseResponse=false,hold=false,arrived,release;
 const arrivedPromise=()=>new Promise(r=>arrived=r);
 const errors=[];
 async function configure(p){p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await p.route('https://diary.test/**',r=>{const n=new URL(r.request().url()).pathname.slice(1)||'index.html',f=path.join(root,n);return fs.existsSync(f)?r.fulfill({contentType:n.endsWith('.js')?'text/javascript':n.endsWith('.html')?'text/html':'application/json',body:fs.readFileSync(f)}):r.fulfill({status:404})});await p.route('https://worker.test/**',async r=>{
  const headers={'Access-Control-Allow-Origin':'https://diary.test','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers});
  const endpoint=new URL(r.request().url()).pathname,data=r.request().postDataJSON();calls.push({endpoint,data});let result;
  if(endpoint==='/catalog')result={protocol:2,media:1,reliability:1,database:'db',syncStartedAt:new Date().toISOString(),since:data.since||null,entries:remote.filter(e=>!data.since||Date.parse(e.version)>=Date.parse(data.since)).map(e=>({...e,text:undefined})),hasMore:false};
  else if(endpoint==='/read')result=remote.find(e=>e.pageId===data.pageId);
  else if(endpoint==='/write'){
   assert.ok(data.operationId);const old=remote.find(e=>e.id===data.entry.id);const target={...data.entry,deleted:!!data.deleted};
   if(old&&canonical(old)!==canonical(target)&&hash(old)!==data.baseHash)return r.fulfill({status:409,headers,contentType:'application/json',body:JSON.stringify({error:'conflict',pageId:old.pageId})});
   result={...target,pageId:old?.pageId||'page'+remote.length,version:new Date(Date.now()-600000+(++version)*1000).toISOString()};remote=remote.filter(e=>e.id!==result.id);remote.push(result);
   if(hold){hold=false;arrived();await new Promise(r=>release=r);}
   if(loseResponse){loseResponse=false;return r.fulfill({status:504,headers,contentType:'application/json',body:'{"error":"response lost"}'});}
  }else throw Error(endpoint);
  return r.fulfill({headers,contentType:'application/json',body:JSON.stringify(result)});
 });}
 await configure(a);await a.addInitScript(()=>{if(localStorage.getItem('test-seed'))return;localStorage.setItem('test-seed','1');localStorage.setItem('penang_timeline_diary',JSON.stringify([{id:'one',date:'2026-10-26',source:'小夏',text:'Original',tags:[],createdAt:1}]));localStorage.setItem('penang_timeline_settings',JSON.stringify({syncUrl:'https://worker.test'}));sessionStorage.setItem('diary_sync_secret','test');});await a.goto('https://diary.test/');await a.waitForFunction(()=>window.diaryReady);
 const sync=async(p=a)=>{await p.locator('#sync-btn').click();await p.evaluate(()=>window.lastSyncRun)};
 const change=async(p,text)=>p.evaluate(async text=>{const e=structuredClone(entries.find(e=>e.id==='one'));await DiaryStore.upsert({...e,text},e);await refreshDiaryData()},text);
 assert.equal(calls.length,0);await sync();assert.equal(remote.length,1);assert.equal((await a.evaluate(()=>DiaryStore.readSync('diary_sync_v1:https://worker.test:db'))).items.one.hash,hash(remote[0]));
 let offset=calls.length;await sync();assert.deepEqual(calls.slice(offset).map(c=>c.endpoint),['/catalog']);
 await change(a,'Local update');offset=calls.length;await sync();assert.deepEqual(calls.slice(offset).map(c=>c.endpoint),['/catalog','/write']);assert.equal(remote.find(e=>e.id==='one').text,'Local update');
 remote[0].text='Notion edit';remote[0].version=new Date().toISOString();await sync();assert.equal(await a.evaluate(()=>entries.find(e=>e.id==='one').text),'Notion edit');
 await change(a,'Conflict local');remote.find(e=>e.id==='one').text='Conflict remote';remote.find(e=>e.id==='one').version=new Date(Date.now()+1).toISOString();await sync();assert.ok(await a.evaluate(()=>entries.some(e=>e.text==='Conflict local'&&e.tags.includes('同步冲突'))));assert.equal(await a.evaluate(()=>entries.find(e=>e.id==='one').text),'Conflict remote');await sync();assert.equal(remote.length,2);
 // Lost successful response leaves a pending operation and does not advance the checkpoint.
 await change(a,'Retry me');const checkpoint=(await a.evaluate(()=>DiaryStore.readSync('diary_sync_v1:https://worker.test:db'))).watermark;loseResponse=true;await sync();assert.equal((await a.evaluate(()=>DiaryStore.readSync('diary_sync_v1:https://worker.test:db'))).watermark,checkpoint);assert.equal(await a.evaluate(async()=>(await DiaryStore.operation()).filter(o=>o.status==='pending').length),1);await sync();assert.equal(remote.filter(e=>e.id==='one').length,1);assert.equal(await a.evaluate(async()=>(await DiaryStore.operation()).filter(o=>o.status==='pending').length),0);
 // New local edits during an in-flight sync remain local, then are safely submitted after recovery.
 const b=await context.newPage();await configure(b);await b.goto('https://diary.test/');await b.waitForFunction(()=>window.diaryReady);await b.evaluate(()=>document.getElementById('sync-secret').value='test');
 await change(a,'Request A');hold=true;const serverArrived=arrivedPromise();await a.locator('#sync-btn').click();await serverArrived;
 await b.waitForFunction(()=>entries.find(e=>e.id==='one')?.text==='Request A');await change(b,'Newer local B');release();await a.evaluate(()=>window.lastSyncRun);assert.equal(await a.evaluate(()=>entries.find(e=>e.id==='one').text),'Newer local B');assert.equal(remote.find(e=>e.id==='one').text,'Request A');
 await sync();assert.equal(remote.find(e=>e.id==='one').text,'Newer local B');assert.equal(await a.evaluate(()=>entries.find(e=>e.id==='one').text),'Newer local B');
 assert.deepEqual(errors,[]);console.log('PASS: hashed baseline sync, empty delta/local-only write, Notion edits, conflict copies, durable operation after lost response, safe recovery, concurrent edit during response never overwritten.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
