const {chromium}=require('playwright');const crypto=require('node:crypto');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.DIARY_CHROME?{executablePath:process.env.DIARY_CHROME}:{})});
 const page=await browser.newPage({serviceWorkers:'block'});let requests=[],failRead=null,startTimes=[],otherDatabase=false,legacyProtocol=false,cancelAfterCatalog=false,lateEdit=false;
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const oldVersion='2020-01-01T00:00:00.000Z';
 let remote=Array.from({length:1000},(_,i)=>({id:'id'+i,pageId:'page'+i,version:oldVersion,date:'2020-01-01',source:'五月',tags:[],text:'History '+i,createdAt:i+1}));
 await page.route('https://diary.test/**',r=>{
  const name=new URL(r.request().url()).pathname.slice(1)||'index.html';
  return r.fulfill({contentType:name.endsWith('.js')?'text/javascript':'text/html',body:fs.readFileSync(path.join(__dirname,'..',name),'utf8')});
 });
 await page.route('https://worker.test/**',async r=>{
  if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'https://diary.test','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS'}});
  const endpoint=new URL(r.request().url()).pathname,data=r.request().postDataJSON();requests.push({endpoint,data});
  const headers={'Access-Control-Allow-Origin':'https://diary.test'};let result;
  if(endpoint==='/catalog'){
   const syncStartedAt=new Date().toISOString();startTimes.push(syncStartedAt);
   const all=remote.filter(e=>!data.since||Date.parse(e.version)>=Date.parse(data.since));
   const offset=Number(data.cursor||0),slice=all.slice(offset,offset+100);
   result={protocol:legacyProtocol?1:2,media:1,reliability:1,database:otherDatabase?'other':'db',since:data.since||null,syncStartedAt,entries:slice.map(e=>({...e,text:undefined})),hasMore:offset+100<all.length,cursor:offset+100<all.length?String(offset+100):null};
   if(cancelAfterCatalog){cancelAfterCatalog=false;await page.evaluate(()=>document.querySelector('#cancel-sync').click());}
   if(lateEdit){lateEdit=false;remote[0].text='Late Notion edit';remote[0].version=new Date().toISOString();}
  }else if(endpoint==='/read'){
   if(data.pageId===failRead)return r.fulfill({status:429,headers,contentType:'application/json',body:'{"error":"rate limit"}'});
   result=remote.find(e=>e.pageId===data.pageId);
  }else if(endpoint==='/write'){
   let current=remote.find(e=>e.pageId===data.pageId);
   if(current&&data.baseHash!==crypto.createHash('sha256').update(JSON.stringify([current.date,current.text,current.source,current.tags.slice().sort()])).digest('hex'))return r.fulfill({status:409,headers,contentType:'application/json',body:'{"error":"conflict"}'});
   result={...data.entry,pageId:data.pageId||'new'+remote.length,version:oldVersion,deleted:!!data.deleted};
   remote=remote.filter(e=>e.id!==result.id);remote.push(result);
  }else throw Error(endpoint);
  return r.fulfill({headers,contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.addInitScript(seed=>{
  const items={};seed.forEach(e=>{items[e.id]={pageId:e.pageId,version:e.version,checkedAt:Date.parse('2021-01-01'),signature:JSON.stringify([e.date,e.text,e.source,e.tags])}});
  localStorage.setItem('penang_timeline_diary',JSON.stringify(seed));
  localStorage.setItem('penang_timeline_settings',JSON.stringify({syncUrl:'https://worker.test'}));
  sessionStorage.setItem('diary_sync_secret','test-secret');
  localStorage.setItem('diary_sync_v1:https://worker.test:db',JSON.stringify({confirmed:true,items,lastSync:'2021-01-01T00:00:00.000Z'}));
 },remote);
 await page.goto('https://diary.test/');await page.waitForFunction(()=>window.diaryReady);
 const state=()=>page.evaluate(()=>DiaryStore.readSync('diary_sync_v1:https://worker.test:db'));
 async function sync(full=false){
  if(full)await page.evaluate(()=>document.querySelector('#full-sync-btn').click());else await page.locator('#sync-btn').click();
  await page.evaluate(()=>window.lastSyncRun);
 }
 // Upgrade: full pagination once, no writes or body reads, server first-page start checkpoint.
 await sync();assert.equal(requests.length,10);assert.ok(requests.every(r=>r.endpoint==='/catalog'&&r.data.since===null));
 assert.equal((await state()).watermark,startTimes[0]);
 let offset=requests.length;await sync();assert.equal(requests.length-offset,1);assert.ok(requests.at(-1).data.since);
 assert.equal(await page.evaluate(()=>entries.length),1000);
 // Local-only edit is uploaded even when absent from the remote delta.
 await page.evaluate(async()=>{const e=structuredClone(entries.find(e=>e.id==='id123'));await DiaryStore.upsert({...e,text:'Local only'},e);await refreshDiaryData()});
 offset=requests.length;await sync();assert.deepEqual(requests.slice(offset).map(r=>r.endpoint),['/catalog','/write']);assert.equal(remote.find(e=>e.id==='id123').text,'Local only');
 // Notion changes: partial failure must not advance watermark; retry retains committed progress.
 remote.find(e=>e.id==='id5').text='Remote first';remote.find(e=>e.id==='id5').version=new Date().toISOString();
 remote.find(e=>e.id==='id6').text='Remote second';remote.find(e=>e.id==='id6').version=new Date().toISOString();
 const before=(await state()).watermark;failRead='page6';await sync();assert.equal((await state()).watermark,before);
 assert.equal(await page.evaluate(()=>entries.find(e=>e.id==='id5').text),'Remote first');
 failRead=null;await sync();assert.equal(await page.evaluate(()=>entries.find(e=>e.id==='id6').text),'Remote second');
 assert.equal(await page.evaluate(()=>entries.filter(e=>e.id==='id5').length),1);
 // Full audit is explicit and unfiltered.
 offset=requests.length;await sync(true);assert.equal(requests.slice(offset).filter(r=>r.endpoint==='/catalog').length,10);assert.ok(requests.slice(offset).filter(r=>r.endpoint==='/catalog').every(r=>r.data.since===null));
 // Recent unchanged records must not be read repeatedly.
 offset=requests.length;await sync();assert.deepEqual(requests.slice(offset).map(r=>r.endpoint),['/catalog']);
 // Cancellation and a mismatched Worker protocol cannot advance the checkpoint.
 const checkpoint=()=>page.evaluate(()=>DiaryStore.readSync('diary_sync_v1:https://worker.test:db').then(s=>s.watermark));
 const savedCheckpoint=await checkpoint();cancelAfterCatalog=true;await sync();assert.equal(await checkpoint(),savedCheckpoint);
 offset=requests.length;legacyProtocol=true;await sync();assert.equal(await checkpoint(),savedCheckpoint);
 assert.deepEqual(requests.slice(offset).map(r=>r.endpoint),['/catalog']);
 assert.match(await page.locator('#sync-status').textContent(),/先部署/);
 assert.deepEqual(errors,[]);
 console.log('PASS: 1000 existing diaries: upgrade 10 catalog requests/zero writes; unchanged incremental 1 request; local-only edit 2 requests; partial failure retains checkpoint and progress; explicit full audit; recent unchanged records avoid repeated reads; cancellation/protocol mismatch preserves checkpoint.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
