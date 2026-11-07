const assert=require('node:assert/strict'),fs=require('node:fs'),h=require('./browser-utils.cjs');
(async()=>{
 const b=await h.launch(),c=await b.newContext({serviceWorkers:'block',viewport:{width:390,height:844},reducedMotion:'reduce'});
 const future=new Date(Date.now()+3600000).toISOString(),past=new Date(Date.now()-3600000).toISOString();
 const p=await h.page(c,{penang_timeline_authors:{defaultName:'五月',names:['五月']},penang_timeline_diary:[
  {id:'one',date:'2026-11-02',text:'一',source:'五月',tags:[],photos:[{id:'r1',pageId:'p1',revision:'rev1',url:'https://img.test/a.png',expiresAt:future}],createdAt:2},
  {id:'two',date:'2026-11-01',text:'二',source:'五月',tags:[],photos:[{id:'r2',pageId:'p2',revision:'rev2',url:'https://img.test/b.png',expiresAt:future}],createdAt:1},
  {id:'old',date:'2026-10-01',text:'旧',source:'五月',tags:[],photos:[{id:'r3',pageId:'p3',revision:'rev3',url:'https://img.test/c.png',expiresAt:past}],createdAt:0}]});
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 let images=0;await p.route('https://img.test/**',r=>{images++;return r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'image/png',body:fs.readFileSync(h.root+'/icons/icon-192.png')});});
 const local=id=>p.evaluate(async id=>{const e=DiaryStore.snapshot.entries.find(e=>e.id===id),ph=e.photos[0];return ph.localRevision===ph.revision&&(await MediaAssets.store('get',ph.cacheKey))instanceof Blob;},id);
 // Opening a cloud photo keeps a copy on this device.
 await p.locator('[data-entry-id="two"] [aria-label="查看日记图片"]').click();await p.waitForFunction(()=>document.querySelector('#photo-slides img')?.complete);
 await p.waitForFunction(()=>DiaryStore.snapshot.entries.find(e=>e.id==='two').photos[0].localRevision==='rev2');assert.equal(await local('two'),true,'a viewed photo is saved locally');
 await p.locator('#photo-close').click();
 // 把云端照片存到本机: fresh links download directly; an expired link with no connection code is reported clearly.
 await p.locator('#open-settings').click();await p.locator('#data-toggle').click();
 const before=images;await p.locator('#cache-cloud-photos').click();
 await p.waitForFunction(()=>!document.getElementById('cache-cloud-photos').disabled&&/已存|已把/.test(document.getElementById('cache-cloud-status').textContent));
 assert.match(await p.locator('#cache-cloud-status').textContent(),/已存 1 张；1 张未能下载：请先在「同步」里输入连接码再试/);assert.equal(images-before,1);
 assert.equal(await local('one'),true);assert.equal(await local('old'),false);
 // Once everything is local, nothing is fetched again.
 await p.evaluate(async()=>{const e=structuredClone(DiaryStore.snapshot.entries.find(e=>e.id==='old'));await DiaryStore.upsert({...e,photos:[]},e);await refreshDiaryData();});
 const again=images;await p.locator('#cache-cloud-photos').click();await p.waitForFunction(()=>/都已经在本机/.test(document.getElementById('cache-cloud-status').textContent));assert.equal(images,again);
 // Phones that share files get the share sheet for a backup; if it cannot open by itself, a button stays.
 await p.evaluate(()=>{window.shared=[];window.refuse=true;Object.defineProperty(navigator,'canShare',{configurable:true,value:d=>!!d.files});Object.defineProperty(navigator,'share',{configurable:true,value:async d=>{if(window.refuse){window.refuse=false;throw new DOMException('no activation','NotAllowedError');}window.shared.push({name:d.files[0].name,type:d.files[0].type,size:d.files[0].size});}});});
 let downloads=0;p.on('download',()=>downloads++);
 await p.locator('#export-json-btn').click();await p.locator('#backup-share').waitFor({state:'visible'});assert.equal(await p.evaluate(()=>shared.length),0);
 await p.locator('#backup-share').click();await p.waitForFunction(()=>shared.length===1);const file=await p.evaluate(()=>shared[0]);
 assert.match(file.name,/^timeline-diary-.*\.zip$/);assert.equal(file.type,'application/zip');assert.ok(file.size>100);assert.equal(await p.locator('#backup-share').isHidden(),true);
 await p.locator('#export-json-btn').click();await p.waitForFunction(()=>shared.length===2);assert.equal(await p.locator('#backup-share').isHidden(),true);assert.equal(downloads,0,'shared, not downloaded');
 assert.deepEqual(errors,[]);console.log('PASS: viewed cloud photos are kept locally, save-all reports missing connection code, nothing refetched once local, backup opens the share sheet with a fallback button.');await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
