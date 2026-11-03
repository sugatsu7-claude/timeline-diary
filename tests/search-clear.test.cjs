const assert=require('node:assert/strict'),h=require('./browser-utils.cjs');
(async()=>{
 const browser=await h.launch(),context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
 const seed=[{id:'s1',date:'2026-11-01',text:'清晨的茶',source:'小夏',tags:[],createdAt:2},{id:'s2',date:'2026-11-02',text:'午后的雨',source:'小夏',tags:[],createdAt:1}];
 const p=await h.page(context,{penang_timeline_diary:seed,penang_timeline_authors:{defaultName:'小夏',names:['小夏']}});
 assert.equal(await p.locator('#search-clear').isHidden(),true,'no clear button while the box is empty');
 await p.locator('#search-input').fill('清晨的茶');await p.waitForTimeout(300);
 assert.equal(await p.locator('#search-clear').isVisible(),true);assert.equal(await p.locator('.entry-row').count(),1,'search filters the list');
 assert.ok((await p.locator('#search-clear').boundingBox()).width>=28,'button is easy to tap');
 await p.locator('#search-clear').click();await p.waitForTimeout(300);
 assert.equal(await p.locator('#search-input').inputValue(),'');assert.equal(await p.locator('.entry-row').count(),2,'clearing restores the full list');
 assert.equal(await p.locator('#search-clear').isHidden(),true);assert.equal(await p.evaluate(()=>document.activeElement.id),'search-input','focus stays in the box');
 // Resetting filters from the panel also hides the button.
 await p.locator('#search-input').fill('雨');await p.locator('#filter-toggle').click();await p.locator('#filter-clear').click();
 assert.equal(await p.locator('#search-input').inputValue(),'');assert.equal(await p.locator('#search-clear').isHidden(),true);
 console.log('PASS: search clear button appears with text, clears in one tap, keeps focus, and hides after filters reset.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
