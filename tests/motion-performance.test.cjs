const assert=require('node:assert/strict'),h=require('./browser-utils.cjs');
(async()=>{
 const browser=await h.launch(),context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},reducedMotion:'no-preference'});
 // Exercise the compatibility path even on a browser with native scroll timelines.
 await context.addInitScript(()=>{const supports=CSS.supports.bind(CSS);CSS.supports=(...args)=>String(args[0]).includes('animation-timeline')?false:supports(...args);});
 const seed=Array.from({length:40},(_,i)=>({id:'perf'+i,date:'2026-11-01',text:'慢慢读，慢慢记。\n\n今天的晚风很温柔。',source:'小夏',tags:[],createdAt:40-i}));
 const p=await h.page(context,{penang_timeline_diary:seed,penang_timeline_authors:{defaultName:'小夏',names:['小夏']}});
 await p.bringToFront();await p.locator('.header h1').click();assert.equal(await p.evaluate(()=>DiaryMotion.readingMode),'fallback');
 async function paint(){await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
 await paint();await p.waitForTimeout(150);
 const anchor=await p.locator('[data-entry-id="perf4"]').evaluate(row=>({top:row.getBoundingClientRect().top+scrollY,height:row.offsetHeight}));
 await p.evaluate(()=>{window.motionRowReads=0;const original=Element.prototype.getBoundingClientRect;Element.prototype.getBoundingClientRect=function(...args){if(this.matches('#timeline .entry-row'))window.motionRowReads++;return original.apply(this,args);};});
 async function position(center){await p.evaluate(y=>scrollTo(0,y),Math.max(0,anchor.top+anchor.height/2-center));await paint();}
 await position(790);await p.waitForFunction(()=>new DOMMatrix(getComputedStyle(document.querySelector('[data-entry-id="perf4"] .entry-card')).transform).a<.985);
 const edge=await p.locator('[data-entry-id="perf4"] .entry-card').boundingBox();
 await position(455);await p.waitForFunction(()=>new DOMMatrix(getComputedStyle(document.querySelector('[data-entry-id="perf4"] .entry-card')).transform).a>.999);
 const center=await p.locator('[data-entry-id="perf4"] .entry-card').boundingBox();assert.ok(center.width>edge.width+4);
 await position(790);await p.waitForFunction(()=>new DOMMatrix(getComputedStyle(document.querySelector('[data-entry-id="perf4"] .entry-card')).transform).a<.985);
 assert.equal(await p.evaluate(()=>window.motionRowReads),0,'ordinary scrolling must not remeasure entry rows');
 await p.waitForTimeout(500);const settled=await p.locator('[data-entry-id="perf4"]').getAttribute('style');await p.waitForTimeout(250);assert.equal(await p.locator('[data-entry-id="perf4"]').getAttribute('style'),settled,'motion stops writing styles after it settles');
 await p.setViewportSize({width:430,height:844});await paint();await p.waitForTimeout(100);assert.ok(await p.evaluate(()=>window.motionRowReads)>0,'resize must refresh cached geometry');await p.evaluate(()=>window.motionRowReads=0);await p.evaluate(()=>scrollTo(0,1000));await paint();await p.evaluate(()=>scrollTo(0,700));await paint();assert.equal(await p.evaluate(()=>window.motionRowReads),0,'resized page must return to cached scrolling');
 console.log('PASS: fallback edge/center motion, zero row geometry reads during scroll, resize invalidation, and no style updates after settling.');await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
