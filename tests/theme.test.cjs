const assert=require('node:assert/strict'),h=require('./browser-utils.cjs');
(async()=>{
 const browser=await h.launch(),context=await browser.newContext({serviceWorkers:'block',reducedMotion:'no-preference',viewport:{width:390,height:844}});
 const p=await h.page(context,{penang_timeline_diary:[{id:'t1',date:'2026-11-01',text:'今日闲读，窗外微雨。',source:'小夏',tags:['日常'],createdAt:1}],penang_timeline_authors:{defaultName:'小夏',names:['小夏']}});
 const css=(sel,prop)=>p.locator(sel).first().evaluate((el,prop)=>getComputedStyle(el)[prop],prop);
 assert.equal(await p.evaluate(()=>document.documentElement.hasAttribute('data-theme')),false,'default theme has no attribute');
 const before=await css('.fab','backgroundColor');
 await p.locator('#open-settings').click();await p.locator('#authors-toggle').click();
 await p.locator('#theme-select').selectOption('ink');
 assert.equal(await p.evaluate(()=>document.documentElement.getAttribute('data-theme')),'ink');
 await p.waitForTimeout(300);assert.notEqual(await css('.fab','backgroundColor'),before);assert.equal(await css('.fab','backgroundColor'),'rgb(166, 58, 43)');
 // Persists across reload, then switches back cleanly.
 await p.reload();await p.waitForFunction(()=>window.diaryReady);
 assert.equal(await p.evaluate(()=>document.documentElement.getAttribute('data-theme')),'ink');
 await p.locator('#open-settings').click();await p.locator('#authors-toggle').click();await p.locator('#theme-select').selectOption('default');
 await p.waitForTimeout(300);assert.equal(await p.evaluate(()=>document.documentElement.hasAttribute('data-theme')),false);assert.equal(await css('.fab','backgroundColor'),before);
 console.log('PASS: ink theme is opt-in, applies instantly, persists, and switching back restores the default look.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
