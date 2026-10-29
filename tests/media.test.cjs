const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.DIARY_CHROME?{executablePath:process.env.DIARY_CHROME}:{})});
 const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
 const root=path.join(__dirname,'..');let calls=[],remote=[],uploads=0,revision=0,imageRequests=[];
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('https://diary.test/**',r=>{const name=new URL(r.request().url()).pathname.slice(1)||'index.html';return r.fulfill({contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.png')?'image/png':name.endsWith('.html')?'text/html':'application/json',body:fs.readFileSync(path.join(root,name))});});
 await page.route('https://images.test/**',r=>{imageRequests.push(r.request().url());return r.fulfill({contentType:'image/png',body:fs.readFileSync(path.join(root,'icons/icon-192.png'))});});
 await page.route('https://worker.test/**',async r=>{
  if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'https://diary.test','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS'}});
  const endpoint=new URL(r.request().url()).pathname;calls.push(endpoint);let result;
  if(endpoint==='/upload'){uploads++;assert.ok(r.request().headers()['content-type'].startsWith('multipart/form-data'));result={fileUploadId:require('node:crypto').randomUUID(),expiresAt:'2030-01-01T00:00:00Z'};}
  else{
   const data=r.request().postDataJSON();
   if(endpoint==='/catalog')result={protocol:2,media:1,reliability:1,syncStartedAt:new Date().toISOString(),since:data.since||null,database:'db',entries:remote.map(e=>({...e,text:undefined,photos:undefined,links:undefined})),hasMore:false};
   else if(endpoint==='/read')result=remote.find(e=>e.pageId===data.pageId);
   else if(endpoint==='/write'){
    result={...data.entry,pageId:data.pageId||'page1',version:'version'+(++revision),deleted:!!data.deleted};
    result.photos=(data.entry.photos||[]).map(p=>({...p,blockId:p.blockId||require('node:crypto').randomUUID(),pageId:result.pageId,revision:'https://images.test/'+p.id+'.jpg',url:'https://images.test/'+p.id+'.jpg',expiresAt:'2030-01-01T00:00:00Z'}));
    remote=remote.filter(e=>e.id!==result.id);remote.push(result);
   }else throw Error(endpoint);
  }
  return r.fulfill({headers:{'Access-Control-Allow-Origin':'https://diary.test'},contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.goto('https://diary.test/');await page.waitForFunction(()=>window.diaryReady);
 assert.equal(calls.length,0);
 await page.locator('#open-settings').click();await page.locator('#settings-toggle').click();
 await page.locator('#local-background').setInputFiles(path.join(root,'icons/icon-512.png'));
 await page.waitForFunction(()=>appSettings.localBackground===true&&document.querySelector('#bg-layer').style.backgroundImage.includes('blob:'));
 assert.equal(calls.length,0,'local background never calls Worker');
 await page.locator('#sync-url').fill('https://worker.test');await page.locator('#sync-secret').fill('test-secret');await page.locator('#settings-save-btn').click();await page.locator('#close-settings').click();
 await page.locator('#add-fab').click();await page.locator('#first-author').fill('测试记录人');await page.locator('#confirm-first-author').click();await page.locator('#entry-text').fill('Photos and links');
 await page.locator('#entry-photos').setInputFiles([path.join(root,'icons/icon-192.png'),path.join(root,'icons/icon-512.png')]);
 await page.waitForFunction(()=>!mediaBusy&&sheetPhotos.length===2);
 await page.locator('#entry-links').fill('javascript:alert(1)');await page.locator('#sheet-save').click();assert.equal(await page.evaluate(()=>entries.length),0);
 await page.locator('#entry-links').fill('https://weibo.com/example\nhttps://example.com/');await page.locator('#sheet-save').click();
 await page.waitForFunction(()=>!document.querySelector('#sheet').classList.contains('open'));assert.equal(await page.evaluate(()=>entries[0].photos.length),2);assert.equal(calls.length,0);
 await page.screenshot({path:'/workspace/diary-capsule-preview.png'});
 assert.equal(await page.locator('.entry-card img').count(),0,'capsule has no thumbnails');
 await page.locator('[aria-label="查看日记图片"]').click();await page.waitForFunction(()=>document.querySelector('#photo-slides img')?.naturalWidth>0);
 await page.screenshot({path:'/workspace/diary-gallery-preview.png'});
 assert.ok((await page.locator('#photo-slides img').first().getAttribute('src')).startsWith('blob:'));
 await page.locator('#photo-next').click();await page.waitForFunction(()=>document.querySelector('#photo-counter').textContent==='2 / 2');await page.locator('#photo-close').click();
 await page.locator('[aria-label="查看日记链接"]').click();assert.equal(await page.locator('#entry-link-list a').count(),2);await page.screenshot({path:'/workspace/diary-links-preview.png'});assert.equal(await page.locator('#entry-link-list a').first().getAttribute('target'),'_blank');await page.locator('#link-close').click();
 async function sync(){await page.locator('#sync-btn').click();await page.evaluate(()=>window.lastSyncRun);}
 await sync();assert.equal(uploads,2);assert.equal(remote[0].photos.length,2);assert.equal(remote[0].links.length,2);
 await page.reload();await page.waitForFunction(()=>window.diaryReady&&document.querySelector('#bg-layer').style.backgroundImage.includes('blob:'));
 // Replacing an image in Notion must not display the stale local blob with the same caption ID.
 remote[0].photos[0].revision='https://images.test/replaced.jpg';remote[0].photos[0].url=remote[0].photos[0].revision;remote[0].version='remote-replaced';
 await sync();await page.evaluate(()=>entries[0].photos[0].expiresAt='2000-01-01T00:00:00Z');
 const before=calls.length;await page.locator('[aria-label="查看日记图片"]').click();
 await page.waitForFunction(()=>document.querySelector('#photo-slides img')?.naturalWidth>0);
 assert.ok(imageRequests.includes('https://images.test/replaced.jpg'));assert.ok(calls.slice(before).includes('/read'),'expired URL is refreshed only when viewed');await page.locator('#photo-close').click();
 // Removing an already-synced image does not re-upload the remaining one.
 await page.locator('[aria-label="编辑日记"]').click();await page.locator('[aria-label="移除图片1"]').click();await page.locator('#sheet-save').click();await page.waitForFunction(()=>!document.querySelector('#sheet').classList.contains('open'));await sync();assert.equal(uploads,2);assert.equal(remote[0].photos.length,1);
 assert.deepEqual(errors,[]);
 console.log('PASS: local background persistence/no requests, compression and local blobs, safe links, icon-only capsules, gallery navigation, manual uploads, remote image replacement and expired URL refresh, remove without reupload.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
