const assert=require('node:assert/strict'),fs=require('node:fs'),h=require('./browser-utils.cjs');
(async()=>{
 const browser=await h.launch(),context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},reducedMotion:'reduce'});
 const body='傍晚散步时，发现路边的桂花开了。\n\n买了一杯热牛奶，慢慢走回家。今天没有什么特别的事，但这一刻觉得，平凡的日子也很值得被记住。';
 const p=await h.page(context,{penang_timeline_diary:[{id:'card-one',date:'2026-10-26',source:'小夏',text:body,tags:['日常'],photos:[{id:'test-photo'}],links:['https://example.com/private-attachment'],createdAt:1}]});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 let workerCalls=0;await p.route('https://worker.test/**',r=>{workerCalls++;return r.abort()});
 const row=p.locator('[data-entry-id="card-one"]');assert.equal(await row.locator('.entry-heading .entry-tag').textContent(),'日常');assert.equal(await row.locator('.entry-content .entry-tag').count(),0);assert.equal(await row.locator('.entry-content').textContent(),body);
 const buttons=await row.locator('.entry-actions button').all();assert.equal(buttons.length,5);let previous;
 for(const b of buttons){const box=await b.boundingBox();assert.equal(box.width,28);assert.equal(box.height,32);if(previous)assert.ok(box.x-(previous.x+previous.width)<=3,'icons retain compact spacing');previous=box;}
 const sourceBox=await row.locator('.entry-author').boundingBox(),tagBox=await row.locator('.entry-heading .entry-tag').boundingBox();assert.ok(Math.abs(sourceBox.y-tagBox.y)<8,'name and tag share a row');
 await p.screenshot({path:h.root+'/test-results/diary-cards-home.png'});
 await row.locator('[aria-label="生成日记卡片"]').click();await p.waitForFunction(()=>!document.getElementById('card-save').disabled);
 const count=p.locator('#card-count');assert.equal(await count.textContent(),'1 / 1');assert.equal(await p.locator('#card-canvas').getAttribute('width'),'1080');assert.equal(await p.locator('#card-canvas').getAttribute('height'),'1080');assert.ok(!(await p.locator('#card-readable').textContent()).includes('private-attachment'));
 const versions=[];for(const theme of ['cream','letter','night']){
  await p.locator('[data-card-style="'+theme+'"]').click();await p.waitForFunction(()=>!document.getElementById('card-save').disabled);
  const data=await p.locator('#card-canvas').evaluate(c=>c.toDataURL());assert.ok(data.length>2000);versions.push(data);
  const event=p.waitForEvent('download');await p.locator('#card-save').click();const dl=await event,bytes=fs.readFileSync(await dl.path());assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.equal(bytes.readUInt32BE(16),1080);assert.equal(bytes.readUInt32BE(20),1080);assert.match(dl.suggestedFilename(),new RegExp(theme));
  await p.screenshot({path:h.root+'/test-results/diary-card-'+theme+'-preview.png'});
 }
 assert.equal(new Set(versions).size,3,'all three themes render distinct artwork');
 // A supported phone can share the already-rendered PNG without a network request.
 await p.evaluate(()=>{Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.sharedCard={name:data.files[0].name,type:data.files[0].type,size:data.files[0].size}}});});
 await p.locator('[data-card-style="cream"]').click();await p.waitForFunction(()=>!document.getElementById('card-share').hidden&&!document.getElementById('card-share').disabled);await p.locator('#card-share').click();assert.equal(await p.evaluate(()=>sharedCard.type),'image/png');
 await p.locator('#card-close').click();
 // Long CJK, emoji, Latin text and blank lines are preserved across square pages.
 const long=('一段很长的日记，标点和换行都应该保留。👩‍👩‍👧‍👦🐈‍⬛\n\n'+'https://example.com/averylongwordwithoutspaces\n').repeat(13);
 await p.evaluate(async text=>{const e=structuredClone(entries[0]);await DiaryStore.upsert({...e,text},e);await refreshDiaryData()},long);
 await p.locator('[aria-label="生成日记卡片"]').click();await p.waitForFunction(()=>!document.getElementById('card-save').disabled);
 let collected='',pages=0;while(true){collected+=(await p.locator('#card-readable').textContent()).replaceAll('\n','');pages++;if(await p.locator('#card-next').isDisabled())break;await p.locator('#card-next').click();await p.waitForFunction(()=>!document.getElementById('card-save').disabled);}
 assert.ok(pages>1);assert.equal(collected,long.replaceAll('\n',''));assert.match(await count.textContent(),new RegExp(' / '+pages+'$'));await p.locator('#card-prev').click();await p.waitForFunction(()=>!document.getElementById('card-save').disabled);await p.locator('#card-close').click();
 // No-text entries remain usable for attachments, but cannot make an empty card.
 await p.evaluate(async()=>{const e=structuredClone(entries[0]);await DiaryStore.upsert({...e,text:''},e);await refreshDiaryData()});assert.equal(await p.locator('[aria-label="生成日记卡片"]').isDisabled(),true);assert.equal(await p.locator('[aria-label="查看日记图片"]').isEnabled(),true);
 await p.setViewportSize({width:320,height:760});await p.evaluate(async()=>{const e=structuredClone(entries[0]);await DiaryStore.upsert({...e,source:'一个比较长的记录人名字',tags:['长标签也应留在名字这一栏','第二个标签'],text:'Small viewport'},e);await refreshDiaryData()});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.equal(workerCalls,0);assert.deepEqual(errors,[]);console.log('PASS: compact five-icon actions, tags beside author, square 1080px PNGs, three styles, local file share, long-text/emoji pagination without loss, text-only/no-Worker export and narrow-screen layout.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
