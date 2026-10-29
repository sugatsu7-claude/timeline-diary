const {chromium}=require('playwright');const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const root=path.join(__dirname,'..');
function unpack(bytes){let p=0;const files=new Map();while(p+30<=bytes.length&&bytes.readUInt32LE(p)===0x04034b50){const size=bytes.readUInt32LE(p+18),n=bytes.readUInt16LE(p+26),extra=bytes.readUInt16LE(p+28),name=bytes.subarray(p+30,p+30+n).toString(),offset=p+30+n+extra;files.set(name,{bytes:bytes.subarray(offset,offset+size),offset});p=offset+size;}return {data:JSON.parse(files.get('manifest.json').bytes),files};}
async function setup(context){const p=await context.newPage();p.on('dialog',d=>d.accept());await p.route('https://diary.test/**',r=>{const n=new URL(r.request().url()).pathname.slice(1)||'index.html',f=path.join(root,n);if(!fs.existsSync(f))return r.fulfill({status:404});return r.fulfill({contentType:n.endsWith('.js')?'text/javascript':n.endsWith('.html')?'text/html':n.endsWith('.png')?'image/png':'application/json',body:fs.readFileSync(f)});});await p.goto('https://diary.test/');await p.waitForFunction(()=>window.diaryReady);return p;}
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.DIARY_CHROME?{executablePath:process.env.DIARY_CHROME}:{})}),context=await browser.newContext({serviceWorkers:'block'}),a=await setup(context);let downloads=0;
 await a.route('https://worker.test/download',r=>{downloads++;assert.equal(r.request().headers().authorization,'Bearer private-backup-code');return r.fulfill({headers:{'Access-Control-Allow-Origin':'https://diary.test'},contentType:'image/png',body:fs.readFileSync(path.join(root,'icons/icon-512.png'))});});
 await a.evaluate(async()=>{
  await DiaryStore.setConfig(SETTINGS_KEY,{syncUrl:'https://worker.test',scrim:72,cardOpacity:62});await DiaryStore.secret('private-backup-code');
  const blob=await(await fetch('https://diary.test/icons/icon-192.png')).blob(),id=await MediaAssets.hash(blob);await MediaAssets.store('put',id,blob);
  await DiaryStore.upsert({id:'with-photos',date:'2026-10-26',text:'Pictures',source:'小夏',tags:['日常'],photos:[{id},{id:'remote1',pageId:'page1',revision:'cloud-revision',url:'https://image.invalid/file'}],links:['https://example.com/']});
 });await a.reload();await a.waitForFunction(()=>window.diaryReady);
 await a.locator('#open-settings').click();await a.locator('#settings-toggle').click();
 let event=a.waitForEvent('download');await a.locator('#export-json-btn').click();let file=await event,local=unpack(fs.readFileSync(await file.path())).data;assert.equal(local.version,4);assert.equal(local.manifest.complete,false);assert.equal(local.manifest.missing.length,1);assert.equal(downloads,0);
 event=a.waitForEvent('download');await a.locator('#full-backup-btn').click();file=await event;const bytes=fs.readFileSync(await file.path()),full=unpack(bytes).data;
 assert.equal(full.manifest.complete,true);assert.equal(full.assets.length,2);assert.equal(downloads,1);assert.ok(!bytes.toString().includes('private-backup-code'));assert.equal(full.entries[0].photos[1].localRevision,'cloud-revision');
 const fresh=await browser.newContext({serviceWorkers:'block'}),b=await setup(fresh);await b.locator('#open-settings').click();await b.locator('#settings-toggle').click();await b.locator('#import-json-input').setInputFiles({name:'complete.zip',mimeType:'application/zip',buffer:bytes});await b.waitForFunction(()=>entries.length===1);
 assert.equal(await b.evaluate(()=>DiaryStore.config(SETTINGS_KEY).syncUrl),'https://worker.test');assert.equal(await b.evaluate(()=>DiaryStore.secret()),'');assert.equal(await b.locator('#sync-url').inputValue(),'https://worker.test');
 assert.equal(await b.evaluate(async()=>{for(const p of entries[0].photos){const blob=await MediaAssets.store('get',p.cacheKey||p.id);if(!(blob instanceof Blob)||await MediaAssets.hash(blob)!==(p.cacheKey||p.id))return false;}return true;}),true);
 // Read-only historical pages can exceed the editor's eight-attachment limit and still restore.
 const readonly={format:'timeline-diary',version:3,entries:[{id:'readonly',date:'2026-10-25',text:'Preview',source:'小夏',tags:[],readOnly:true,photos:Array.from({length:9},(_,i)=>({id:'ref'+i})),links:Array.from({length:9},(_,i)=>'https://example.com/'+i)}],assets:[],configs:{},trash:[],drafts:[],manifest:{complete:false,missing:[]}};
 await b.locator('#import-json-input').setInputFiles({name:'readonly.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(readonly))});await b.waitForFunction(()=>entries.length===2);assert.equal(await b.evaluate(()=>entries.find(e=>e.id==='readonly').photos.length),9);
 // Tampered assets fail before journal changes.
 const corrupt=Buffer.from(bytes),assetFile=Array.from(unpack(corrupt).files.entries()).find(([name])=>name.startsWith('assets/'))[1];corrupt[assetFile.offset]^=1;
 await b.locator('#import-json-input').setInputFiles({name:'bad.zip',mimeType:'application/zip',buffer:corrupt});await b.waitForFunction(()=>document.querySelector('#backup-status').textContent.includes('校验失败'));assert.equal(await b.evaluate(()=>entries.length),2);
 // Cleanup protects journal/trash/draft references and fresh files, even across asset metadata writes.
 await a.evaluate(async()=>{
  await MediaAssets.store('put','orphan-old',new Blob(['orphan'],{type:'image/png'}));await MediaAssets.store('put','draft-keep',new Blob(['draft'],{type:'image/png'}));await MediaAssets.store('put','new-file',new Blob(['new'],{type:'image/png'}));
  await DiaryStore.draft('other-tab',{snapshot:{date:'2026-10-26',text:'Unsaved',source:'小夏',tags:[],photos:[{id:'draft-keep'}]}});
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('timeline-diary-assets',2);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  await new Promise((resolve,reject)=>{const tx=db.transaction('assetMeta','readwrite');for(const key of ['orphan-old','draft-keep'])tx.objectStore('assetMeta').put({touchedAt:Date.now()-9*86400000},key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();
 });
 await a.locator('#storage-cleanup').click();await a.waitForFunction(async()=>!(await MediaAssets.store('get','orphan-old')));assert.equal(await a.evaluate(async()=>!!(await MediaAssets.store('get','draft-keep'))),true);assert.equal(await a.evaluate(async()=>!!(await MediaAssets.store('get','new-file'))),true);
 assert.equal(await a.evaluate(async()=>{for(const p of entries[0].photos)if(!await MediaAssets.store('get',p.cacheKey||p.id))return false;return true;}),true);
 console.log('PASS: local backup marks missing cloud image; explicit full backup downloads/verifies all images; no secrets in backup; empty-profile restore/config recovery; readonly 9-image records restore; tampered images rejected; cleanup protects referenced/draft/recent files.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
