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
 await p.waitForTimeout(300);assert.notEqual(await css('.fab','backgroundColor'),before);assert.equal(await css('.fab','backgroundColor'),'rgb(176, 88, 75)');
 // Dropdown shows a chevron, and the add-author button keeps horizontal text.
 assert.ok((await css('#theme-select','backgroundImage')).includes('svg'),'theme dropdown has a visible arrow');
 assert.ok((await p.locator('#add-author').boundingBox()).height<50,'add-author label is not wrapped vertically');
 // Each theme has its own built-in background; the ink one is the willow painting.
 const bg=()=>p.locator('#bg-layer').evaluate(el=>el.style.backgroundImage);
 assert.ok((await bg()).includes('ink-bg.jpg'),'ink theme uses its own background');
 await p.locator('#theme-select').selectOption('default');await p.waitForTimeout(200);assert.ok((await bg()).includes('IMG_0586.jpg'),'default theme keeps its photo');
 await p.locator('#theme-select').selectOption('ink');await p.waitForTimeout(200);assert.ok((await bg()).includes('ink-bg.jpg'));
 // Chinese date numerals, and a custom background stays visible (scrim follows the opacity setting).
 assert.deepEqual(await p.evaluate(()=>[1,10,11,20,21,23,29,30,31].map(cnDay)),['一','十','十一','二十','廿一','廿三','廿九','三十','三十一']);
 assert.equal(await p.locator('.entry-date-day').first().getAttribute('data-cn'),'一');assert.equal(await p.locator('.entry-date-month').first().getAttribute('data-cn'),'十一月');
 await p.evaluate(()=>{applyBackground('data:image/gif;base64,R0lGODlhAQABAAAAACw=');applyScrim(30);});
 assert.equal(await p.evaluate(()=>getComputedStyle(document.getElementById('bg-scrim')).backgroundColor.length>0&&getComputedStyle(document.documentElement).getPropertyValue('--scrim-alpha').trim()),'0.3');
 assert.equal(await p.evaluate(()=>document.getElementById('bg-layer').hasAttribute('data-custom')),true);
 // Saved highlight under the ink theme is a soft glow, not the default green ring.
 await p.evaluate(()=>document.querySelector('.entry-row').classList.add('saved-highlight'));await p.waitForTimeout(200);
 assert.ok((await p.locator('.entry-row.saved-highlight .entry-card').evaluate(el=>getComputedStyle(el).animationName)).includes('saved-highlight-ink'));
 assert.ok(!(await p.locator('.entry-row.saved-highlight .entry-card').evaluate(el=>getComputedStyle(el).boxShadow)).includes('139, 154, 126'));
 await p.evaluate(()=>document.querySelector('.entry-row').classList.remove('saved-highlight'));
 // The resting halo must not draw a bordered, scaling frame.
 assert.equal(await p.locator('.entry-card').first().evaluate(el=>{const s=getComputedStyle(el,'::before');return [s.borderTopWidth,s.transform].join('|');}),'0px|none');
 // Persists across reload, then switches back cleanly.
 await p.reload();await p.waitForFunction(()=>window.diaryReady);
 assert.equal(await p.evaluate(()=>document.documentElement.getAttribute('data-theme')),'ink');
 await p.locator('#open-settings').click();await p.locator('#authors-toggle').click();await p.locator('#theme-select').selectOption('default');
 await p.waitForTimeout(300);assert.equal(await p.evaluate(()=>document.documentElement.hasAttribute('data-theme')),false);assert.equal(await css('.fab','backgroundColor'),before);
 console.log('PASS: ink theme is opt-in, applies instantly, persists, and switching back restores the default look.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
