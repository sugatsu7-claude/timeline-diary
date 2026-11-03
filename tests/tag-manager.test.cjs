const assert=require('node:assert/strict'),h=require('./browser-utils.cjs');
(async()=>{
 const browser=await h.launch(),context=await browser.newContext({serviceWorkers:'block',reducedMotion:'no-preference',viewport:{width:390,height:844}});
 const seed=[{id:'t1',date:'2026-11-01',text:'a',source:'小夏',tags:['日常'],createdAt:1},{id:'t2',date:'2026-11-02',text:'b',source:'小夏',tags:['日常','游戏'],createdAt:2}];
 const p=await h.page(context,{penang_timeline_diary:seed,penang_timeline_authors:{defaultName:'小夏',names:['小夏']}});
 await p.locator('#open-settings').click();await p.locator('#tags-toggle').click();
 const names=()=>p.locator('.manage-tag-chip > span').allTextContents();
 const first=(await names())[0];assert.equal(first,'日常');
 assert.equal(await p.locator('.manage-tag-chip').first().locator('small').textContent(),'2','chip shows how many diaries use the tag');
 assert.equal(await p.locator('#tag-actions').isHidden(),true,'actions stay hidden until a tag is selected');
 // Select, then move later: order changes and persists.
 await p.locator('.manage-tag-chip').first().click();assert.equal(await p.locator('#tag-actions').isVisible(),true);assert.equal(await p.locator('#tag-move-earlier').isDisabled(),true);
 assert.match(await p.locator('#tag-selected-name').textContent(),/日常/);
 await p.locator('#tag-move-later').click();await p.waitForTimeout(150);
 assert.deepEqual((await names()).slice(0,2),['游戏','日常']);assert.deepEqual(await p.evaluate(()=>PRESET_TAGS.slice(0,2)),['游戏','日常']);
 // Adding with the Enter key selects nothing and pops the new chip in.
 await p.locator('#new-tag-input').fill('远行');await p.locator('#new-tag-input').press('Enter');await p.waitForTimeout(150);
 assert.equal((await names()).at(-1),'远行');assert.equal(await p.locator('#new-tag-input').inputValue(),'');
 // Delete asks first (dialog accepted by the helper) and keeps old diaries untouched.
 await p.locator('.manage-tag-chip',{hasText:'远行'}).click();await p.locator('#tag-delete').click();await p.waitForTimeout(150);
 assert.ok(!(await names()).includes('远行'));assert.equal(await p.locator('#tag-actions').isHidden(),true);
 assert.deepEqual(await p.evaluate(()=>entries.find(e=>e.id==='t2').tags),['日常','游戏']);
 // Large touch targets in both themes.
 for(const theme of ['default','ink']){await p.evaluate(t=>DiaryTheme.set(t),theme);await p.locator('.manage-tag-chip').first().click();
  for(const sel of ['.manage-tag-chip','#tag-move-later','#tag-delete'])assert.ok((await p.locator(sel).first().boundingBox()).height>=40,theme+' '+sel+' is at least 40px tall');
  await p.locator('.manage-tag-chip').first().click();}
 console.log('PASS: tag chips with usage counts, select then move/delete with large buttons, Enter to add, order persists, old diaries untouched.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
