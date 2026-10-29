const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.join(__dirname,'..'),original=JSON.parse(fs.readFileSync(path.join(__dirname,'..','version.json'))).version,next=original.replace(/\d+$/,s=>Number(s)+1),after=original.replace(/\d+$/,s=>Number(s)+2);let release=original,broken=false,requests=[];
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://local').pathname;
  requests.push(pathname);
  if(!pathname.startsWith('/timeline-diary/')){res.writeHead(404).end();return;}
  let name=pathname.slice('/timeline-diary/'.length)||'index.html';
  if(name.includes('..')){res.writeHead(403).end();return;}
  if(broken&&name==='sync.js'){res.writeHead(503).end();return;}
  let body;
  try{body=fs.readFileSync(path.join(root,name));}catch{res.writeHead(404).end();return;}
  if(/\.(html|js|json|webmanifest)$/.test(name))body=Buffer.from(body.toString().replaceAll(original,release));
  res.writeHead(200,{'Content-Type':name.endsWith('.js')?'text/javascript':name.endsWith('.html')?'text/html':name.endsWith('.png')?'image/png':'application/json','Cache-Control':'no-store'});res.end(body);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+server.address().port+'/timeline-diary/';
 const browser=await chromium.launch({headless:true,...(process.env.DIARY_CHROME?{executablePath:process.env.DIARY_CHROME}:{})});
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 const errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.waitForFunction(()=>window.diaryReady&&navigator.serviceWorker.controller);
 await page.waitForFunction(()=>document.querySelector('#update-status').textContent.includes('离线缓存已就绪'));
 assert.equal(await page.locator('#update-banner').isVisible(),false,'first install is not a new-version alert');
 // Device data, author and an unsaved draft survive offline reopening.
 await page.evaluate(async()=>{await DiaryStore.upsert({id:'saved1',date:'2026-10-26',text:'Saved diary',source:'叙',tags:['日常'],createdAt:1});await refreshDiaryData();openSheet(entries[0])});
 await page.locator('#entry-text').fill('Unsaved draft');
 await page.waitForFunction(()=>sessionStorage.getItem(DRAFT_KEY)?.includes('Unsaved draft'));
 await context.setOffline(true);
 await page.reload();await page.waitForFunction(()=>document.querySelector('#entry-text').value==='Unsaved draft');
 assert.equal(await page.evaluate(()=>entries[0].text),'Saved diary');
 await page.locator('#sheet-save').click();await page.waitForFunction(()=>!document.querySelector('#sheet').classList.contains('open'));assert.equal(await page.evaluate(()=>sessionStorage.getItem(DRAFT_KEY)),null);
 const offlinePage=await context.newPage();await offlinePage.goto(url);await offlinePage.waitForFunction(()=>window.diaryReady);
 assert.equal(await offlinePage.evaluate(()=>entries[0].text),'Unsaved draft');
 await offlinePage.locator('[aria-label="生成日记卡片"]').click();await offlinePage.waitForFunction(()=>!document.getElementById('card-save').disabled);assert.equal(await offlinePage.locator('#card-canvas').getAttribute('width'),'1080');await offlinePage.locator('#card-close').click();
 // No database requests are cached; this service worker stores exactly the static shell.
 const cacheUrls=await page.evaluate(async()=>{let result=[];for(const k of await caches.keys())for(const req of await(await caches.open(k)).keys())result.push(req.url);return result});
 assert.equal(cacheUrls.length,17);assert.ok(cacheUrls.every(u=>!u.includes('version.json')&&!u.includes('worker')));
 await context.setOffline(false);
 // A release waits for consent and protects drafts in every open tab.
 release=next;
 await offlinePage.evaluate(()=>openSheet(entries[0]));await offlinePage.locator('#entry-text').fill('Other tab draft');
 await page.locator('#open-settings').click();await page.locator('#check-update').click();
 await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);
 await page.waitForFunction(()=>!document.querySelector('#settings-update-now').hidden);
 const bannerBox=await page.locator('#update-banner').boundingBox();
 assert.ok(bannerBox.height<=56,'update notice must stay one compact row');
 assert.equal(await page.locator('#update-message').textContent(),'新版本已就绪');
 const fabBox=await page.locator('#add-fab').boundingBox();assert.ok(fabBox.y+fabBox.height<=bannerBox.y,'add button must not overlap update strip');
 assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#update-message')).whiteSpace),'nowrap');
 assert.equal(await page.evaluate(()=>document.querySelector('meta[name="diary-version"]').content),original);
 await page.locator('#close-settings').click();
 await page.evaluate(()=>openSheet(entries[0]));await page.locator('#entry-text').fill('Draft across upgrade');
 page.once('dialog',d=>d.dismiss());await page.evaluate(()=>document.querySelector('#apply-update').onclick());
 assert.equal(await page.evaluate(()=>document.querySelector('meta[name="diary-version"]').content),original);
 page.once('dialog',d=>d.accept());
 await page.evaluate(()=>document.querySelector('#apply-update').onclick());
 await page.waitForFunction(v=>window.diaryReady&&document.querySelector('meta[name="diary-version"]').content===v,next);
 assert.equal(await page.locator('#entry-text').inputValue(),'Draft across upgrade');
 assert.equal(await offlinePage.locator('#entry-text').inputValue(),'Other tab draft');
 assert.equal(await offlinePage.evaluate(()=>document.querySelector('meta[name="diary-version"]').content),original,'other tab must not be forcibly reloaded');
 // A failed new install must leave the working release/cache intact.
 await page.locator('#sheet-save').click();await page.waitForFunction(()=>!document.querySelector('#sheet').classList.contains('open'));
 await offlinePage.reload();await offlinePage.waitForFunction(()=>document.querySelector('#entry-text').value==='Other tab draft');
 release=after;broken=true;
 await page.locator('#open-settings').click();await page.locator('#check-update').click();
 await page.waitForFunction(async()=>{const r=await navigator.serviceWorker.getRegistration();return !r.installing&&!r.waiting});
 await context.setOffline(true);await page.reload();await page.waitForFunction(()=>window.diaryReady);
 assert.equal(await page.evaluate(()=>document.querySelector('meta[name="diary-version"]').content),next);
 assert.equal(await page.evaluate(()=>entries[0].text),'Draft across upgrade');
 assert.ok(!requests.some(p=>p.includes('/catalog')||p.includes('/write')||p.includes('/read')));
 assert.deepEqual(errors,[]);
 console.log('PASS: first install, subpath scope, offline reload/reopen, shell-only caching, draft restore, explicit update consent, multi-tab editing protection, failed-install rollback, no sync requests.');
 await browser.close();await new Promise(r=>server.close(r));
})().catch(e=>{console.error(e);process.exit(1)});
