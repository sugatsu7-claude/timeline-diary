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
 // A short visible area (as with a phone keyboard up): opening links/place scrolls the sheet so the field is in view above Save.
 await p.evaluate(()=>{if(document.getElementById('sheet').classList.contains('open'))closeSheet();});await p.setViewportSize({width:390,height:520});await p.evaluate(()=>openSheet());await p.waitForTimeout(200);
 assert.match(await p.locator('#entry-date-label').textContent(),/^\d+月\d+日 周[日一二三四五六]$/,'date reads in Chinese whatever the region format');
 for(const [key,id] of [['links','entry-links'],['location','entry-location-name']]){await p.locator('[data-sheet-more="'+key+'"]').click();await p.waitForTimeout(250);
  const v=await p.evaluate(id=>{const s=document.getElementById('sheet').getBoundingClientRect(),r=document.getElementById(id).getBoundingClientRect(),a=document.querySelector('.sheet-actions').getBoundingClientRect();return {ok:r.top>=s.top&&r.bottom<=a.top+1,focused:document.activeElement.id};},id);
  assert.ok(v.ok,id+' is scrolled into the visible part of the sheet');assert.equal(v.focused,id);}
 await p.evaluate(()=>closeSheet());
 // Filter dates also read in Chinese and reset on 清除筛选.
 await p.setViewportSize({width:390,height:844});await p.locator('#filter-toggle').click();assert.equal(await p.locator('#filter-date-from-label').textContent(),'开始日期');
 await p.locator('#filter-date-from').fill('2025-10-01');assert.equal(await p.locator('#filter-date-from-label').textContent(),'2025年10月1日');
 await p.locator('#filter-date-to').fill(new Date().getFullYear()+'-03-05');assert.equal(await p.locator('#filter-date-to-label').textContent(),'3月5日');
 await p.locator('#filter-clear').click();assert.equal(await p.locator('#filter-date-from-label').textContent(),'开始日期');assert.equal(await p.locator('#filter-date-to-label').textContent(),'结束日期');
 console.log('PASS: sheet always opens at the top for new/edit, date visible, reduced motion has no transition, Chinese date pill, opened extras scroll into view, Chinese filter dates.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
