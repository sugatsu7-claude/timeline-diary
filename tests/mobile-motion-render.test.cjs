const assert=require('node:assert/strict'),{devices}=require('playwright'),h=require('./browser-utils.cjs');
(async()=>{
 const browser=await h.launch(),{defaultBrowserType,...phone}=devices['iPhone 13'];
 const context=await browser.newContext({...phone,serviceWorkers:'block',reducedMotion:'no-preference'}),errors=[];
 context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
 const p=await h.page(context,{penang_timeline_diary:[{id:'old',date:'2026-11-01',text:'安静地记录一天。',source:'小夏',tags:[],createdAt:1}],penang_timeline_authors:{defaultName:'小夏',names:['小夏']}});
 const sample=()=>p.locator('[data-entry-id="rendered"]').evaluate(row=>{const style=getComputedStyle(row);return{opacity:Number(style.opacity),y:new DOMMatrix(style.transform).m42,playing:row.getAnimations().map(a=>a.playState)};});
 // Check intermediate rendered properties, not merely a call to animate().
 await p.evaluate(async()=>{await DiaryStore.upsert({id:'rendered',date:'2026-11-02',text:'让生活慢一点。\n\n今天的晚风很温柔。',source:'小夏',tags:[],createdAt:2});await refreshDiaryData();});
 await p.waitForTimeout(120);const during=await sample();await p.waitForTimeout(600);const after=await sample();
 console.log('PHONE ROW',JSON.stringify({during,after}));assert.ok(during.opacity>.3&&during.opacity<.99,JSON.stringify(during));assert.ok(during.y>1,JSON.stringify(during));assert.equal(after.opacity,1);assert.equal(after.y,0);
 await p.locator('[data-entry-id="rendered"] [aria-label="编辑日记"]').click();await p.waitForTimeout(110);
 const sheetDuring=await p.locator('#sheet').evaluate(el=>({y:el.getBoundingClientRect().y,opacity:Number(getComputedStyle(el).opacity)}));const backdropDuring=await p.locator('#sheet-backdrop').evaluate(el=>Number(getComputedStyle(el).opacity));
 await p.waitForTimeout(400);const sheetAfter=await p.locator('#sheet').evaluate(el=>({y:el.getBoundingClientRect().y,opacity:Number(getComputedStyle(el).opacity)}));console.log('PHONE SHEET',JSON.stringify({sheetDuring,sheetAfter,backdropDuring}));assert.ok(sheetDuring.y>sheetAfter.y+3);assert.ok(sheetDuring.opacity<1);assert.equal(sheetAfter.opacity,1);assert.ok(backdropDuring>0&&backdropDuring<1);
 await p.locator('#sheet-cancel').click();await p.waitForTimeout(400);assert.equal(await p.locator('#sheet').evaluate(el=>getComputedStyle(el).visibility),'hidden');
 await p.emulateMedia({reducedMotion:'reduce'});await p.locator('[data-entry-id="rendered"] [aria-label="编辑日记"]').click();assert.equal(await p.locator('#sheet').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');assert.deepEqual(errors,[]);
 console.log('PASS: iPhone touch viewport renders intermediate capsule opacity/translation and sheet/backdrop transitions, settles correctly and honors reduced motion.');await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
