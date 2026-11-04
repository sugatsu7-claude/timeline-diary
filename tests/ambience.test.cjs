const assert=require('node:assert/strict'),h=require('./browser-utils.cjs');
(async()=>{
 const browser=await h.launch(),context=await browser.newContext({serviceWorkers:'block',reducedMotion:'no-preference',viewport:{width:390,height:844}});
 const p=await h.page(context,{penang_timeline_diary:[{id:'a1',date:'2026-11-01',text:'雨天',source:'小夏',tags:['日常'],createdAt:1}],penang_timeline_authors:{defaultName:'小夏',names:['小夏']}});
 const st=()=>p.evaluate(()=>({...DiaryAmbience.stats,running:DiaryAmbience.isRunning()}));
 const tapGutter=async()=>{await p.mouse.click(8,520);await p.waitForTimeout(120);};
 // Off by default: no rain, no ripples.
 await p.evaluate(()=>DiaryTheme.set('ink'));assert.equal((await st()).running,false,'off by default');
 await tapGutter();assert.equal(await p.locator('.ambience-ripple').count(),0);
 // Turning it on outside the ink theme waits for the theme.
 await p.evaluate(()=>DiaryTheme.set('default'));
 await p.locator('#open-settings').click();await p.locator('#feedback-toggle').click();await p.locator('#ambience-toggle').check();
 assert.equal((await st()).running,false);assert.match(await p.locator('#ambience-note').textContent(),/切换到「水墨国风」/);
 await p.evaluate(()=>DiaryTheme.set('ink'));await p.waitForTimeout(100);
 const s1=await st();assert.equal(s1.running,true,'runs in the ink theme');assert.equal(s1.rainStarts,1);
 // 「试一下」previews a bird call and an ink bird.
 await p.locator('#feedback-test').click();await p.waitForTimeout(100);assert.equal((await st()).birds,1);assert.equal(await p.locator('.ambience-bird').count(),1);
 await p.locator('#close-settings').click();
 // Tapping empty background: ripple + drop. Tapping a card: nothing.
 await tapGutter();assert.equal(await p.locator('.ambience-ripple').count(),1);assert.equal((await st()).drops,1);
 await p.locator('.entry-card').first().click({position:{x:120,y:60}});await p.waitForTimeout(100);assert.equal((await st()).drops,1,'cards do not ripple');
 // Saving a diary stamps it with a thump.
 await p.locator('#add-fab').click();await p.locator('#entry-text').fill('檐下听雨');await p.locator('#sheet-save').click();await h.saved(p);
 await p.waitForFunction(()=>DiaryAmbience.stats.thumps>=1,{},{timeout:5000});
 // Other themes stay quiet; the choice is remembered.
 await p.evaluate(()=>DiaryTheme.set('night'));await p.waitForTimeout(100);assert.equal((await st()).running,false);
 await p.reload();await p.waitForFunction(()=>window.diaryReady);await p.evaluate(()=>DiaryTheme.set('ink'));await p.waitForTimeout(100);assert.equal((await st()).running,true,'remembered after reload');
 // Reduced motion keeps the visuals out.
 await p.emulateMedia({reducedMotion:'reduce'});await tapGutter();assert.equal(await p.locator('.ambience-ripple').count(),0);
 console.log('PASS: soundscape is off by default, ink-only, previews a bird, ripples on empty background only, thumps on save, persists, no visuals under reduced motion.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
