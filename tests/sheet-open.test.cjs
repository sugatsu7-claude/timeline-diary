const assert=require('node:assert/strict'),h=require('./browser-utils.cjs');
(async()=>{
 const browser=await h.launch(),context=await browser.newContext({serviceWorkers:'block',reducedMotion:'no-preference',viewport:{width:390,height:560}});
 const text=Array.from({length:40},(_,i)=>'很长的日记第'+i+'行').join('\n');
 const p=await h.page(context,{penang_timeline_diary:[{id:'s1',date:'2026-11-01',text,source:'小夏',tags:[],createdAt:1}],penang_timeline_authors:{defaultName:'小夏',names:['小夏']}});
 const top=()=>p.locator('#sheet').evaluate(el=>el.scrollTop);
 // Open, scroll the sheet to its bottom, close, reopen: date must be visible again.
 await p.locator('#add-fab').click();await p.waitForTimeout(550);
 await p.locator('#sheet').evaluate(el=>{el.scrollTop=el.scrollHeight;});assert.ok(await top()>0,'fixture sheet must be scrollable');
 await p.locator('#sheet-cancel').click();await p.waitForTimeout(350);
 await p.locator('[data-entry-id="s1"] [aria-label="编辑日记"]').click();await p.waitForTimeout(100);
 assert.equal(await top(),0,'editing starts at the top');
 await p.waitForTimeout(500);const date=await p.locator('#entry-date').boundingBox();assert.ok(date.y>=0&&date.y<560,'date is visible on open');
 await p.locator('#sheet-cancel').click();await p.waitForTimeout(350);
 await p.locator('#sheet').evaluate(el=>{el.scrollTop=el.scrollHeight;});
 await p.locator('#add-fab').click();await p.waitForTimeout(100);assert.equal(await top(),0,'new entry starts at the top');
 // Reduced motion keeps the sheet transition off.
 await p.emulateMedia({reducedMotion:'reduce'});assert.equal(await p.locator('#sheet').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
 console.log('PASS: sheet always opens at the top for new/edit, date visible, reduced motion has no transition.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
