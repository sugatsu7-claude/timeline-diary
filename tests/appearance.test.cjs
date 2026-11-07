const assert=require('node:assert/strict'),h=require('./browser-utils.cjs');
(async()=>{
 const browser=await h.launch(),context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
 const p=await h.page(context,{penang_timeline_diary:[{id:'a1',date:'2026-11-01',text:'你好',source:'小夏',tags:[],createdAt:1}],penang_timeline_authors:{defaultName:'小夏',names:['小夏']}});
 for(const theme of ['default','ink']){
  await p.evaluate(t=>DiaryTheme.set(t),theme);
  await p.locator('#open-settings').click();
  // Sound checkbox must stay a real, visible, checkable box; empty date fields must not collapse.
  await p.locator('#feedback-toggle').click();const box=p.locator('#feedback-sound');
  assert.notEqual(await box.evaluate(el=>getComputedStyle(el).appearance),'none',theme+': checkbox keeps native appearance');
  await box.check();assert.equal(await box.isChecked(),true);await box.uncheck();
  await p.locator('#feedback-toggle').click();
  await p.locator('#data-toggle').click();await p.locator('.range-chip[data-range="custom"]').click();
  for(const id of ['backup-from','backup-to'])assert.ok((await p.locator('#'+id).boundingBox()).height>=36,theme+': '+id+' has a normal height');
  await p.locator('#data-toggle').click();
  // Sliders: live preview, restore on close, persist on save.
  if(await p.locator('#authors-toggle').getAttribute('aria-expanded')!=='true')await p.locator('#authors-toggle').click();
  assert.equal(await p.locator('#bg-scrim-input').getAttribute('type'),'range');assert.equal(await p.locator('#card-opacity-input').getAttribute('type'),'range');
  await p.locator('#bg-scrim-input').fill('30');
  assert.equal(await p.locator('#bg-scrim-value').textContent(),'30');
  assert.equal(await p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--scrim-alpha').trim()),'0.3');
  await p.locator('#close-settings').click();await p.locator('#open-settings').click();
  assert.equal(await p.locator('#bg-scrim-input').inputValue(),'25',theme+': unsaved preview is discarded');
  assert.equal(await p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--scrim-alpha').trim()),'0.25');
  await p.locator('#bg-scrim-input').fill('40');await p.locator('#appearance-save-btn').click();await p.waitForFunction(()=>appSettings.scrim==='40');
  await p.locator('#close-settings').click();assert.equal(await p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--scrim-alpha').trim()),'0.4','saved value stays after closing');
  await p.evaluate(()=>{const s={...appSettings,scrim:undefined};delete s.scrim;appSettings=s;});await p.evaluate(()=>restoreAppearancePreview());
 }
 console.log('PASS: checkboxes and date fields keep native sizing in both themes; sliders preview live, discard on close and persist on save.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
