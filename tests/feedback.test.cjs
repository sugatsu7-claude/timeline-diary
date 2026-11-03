const assert=require('node:assert/strict'),h=require('./browser-utils.cjs');
(async()=>{
 const browser=await h.launch(),context=await browser.newContext({serviceWorkers:'block',reducedMotion:'no-preference',viewport:{width:390,height:844}});
 await context.addInitScript(()=>{window.buzzes=[];navigator.vibrate=p=>{window.buzzes.push(p);return true;};});
 const p=await h.page(context,{penang_timeline_diary:[{id:'f1',date:'2026-11-01',text:'你好',source:'小夏',tags:[],createdAt:1}],penang_timeline_authors:{defaultName:'小夏',names:['小夏']}});
 // Off by default: taps and toasts stay silent.
 await p.locator('#open-settings').click();await p.waitForTimeout(100);
 assert.equal(await p.evaluate(()=>window.buzzes.length),0,'no feedback before opt-in');
 await p.locator('#feedback-toggle').click();
 assert.equal(await p.locator('#feedback-haptics').isChecked(),false);assert.equal(await p.locator('#feedback-sound').isChecked(),false);
 await p.locator('#feedback-haptics').check();await p.waitForTimeout(150);
 assert.ok(await p.evaluate(()=>window.buzzes.length)>=1,'enabling gives a confirming tap');
 await p.evaluate(()=>{window.buzzes.length=0;});await p.locator('#feedback-test').click();await p.waitForTimeout(100);
 assert.ok(await p.evaluate(()=>window.buzzes.some(x=>Array.isArray(x))),'test button plays the success pattern');
 // Choice persists across reload; toasts map to success/warn patterns.
 await p.reload();await p.waitForFunction(()=>window.diaryReady);
 assert.equal(await p.evaluate(()=>DiaryFeedback.state().haptics),true);
 await p.evaluate(()=>{window.buzzes.length=0;showToast('已保存');showToast('未能保存');});
 const patterns=await p.evaluate(()=>window.buzzes.slice());assert.equal(patterns.length,2);assert.notDeepEqual(patterns[0],patterns[1]);
 // Reduced motion silences everything.
 await p.emulateMedia({reducedMotion:'reduce'});await p.evaluate(()=>{window.buzzes.length=0;DiaryFeedback.success();DiaryFeedback.snap();});
 assert.equal(await p.evaluate(()=>window.buzzes.length),0);
 console.log('PASS: haptics/sound are opt-in, persist, map toasts to patterns, fall silent under reduced motion.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
