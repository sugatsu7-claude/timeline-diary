const assert=require('node:assert/strict'),h=require('./browser-utils.cjs');
(async()=>{
 const browser=await h.launch(),context=await browser.newContext({serviceWorkers:'block',colorScheme:'light',viewport:{width:390,height:844}});
 const p=await h.page(context,{penang_timeline_diary:[{id:'a',date:'2026-11-01',text:'x',source:'小夏',tags:[],createdAt:1}],penang_timeline_authors:{defaultName:'小夏',names:['小夏']}});
 const attr=()=>p.evaluate(()=>document.documentElement.getAttribute('data-theme'));
 const meta=()=>p.evaluate(()=>document.querySelector('meta[name="theme-color"]').content);
 // Existing users keep their look: dark system alone changes nothing.
 await p.emulateMedia({colorScheme:'dark'});assert.equal(await attr(),null,'a fixed theme ignores the system setting');
 await p.locator('#open-settings').click();await p.locator('#authors-toggle').click();
 await p.locator('#theme-select').selectOption('auto');
 assert.equal(await attr(),'night','auto + dark system = night');assert.equal(await meta(),'#14181B');
 await p.emulateMedia({colorScheme:'light'});await p.waitForTimeout(100);assert.equal(await attr(),null,'auto follows the system back to light');assert.equal(await meta(),'#1B3A6B');
 await p.emulateMedia({colorScheme:'dark'});await p.waitForTimeout(100);assert.equal(await attr(),'night','and switches live again');
 // The choice persists across reload and resolves against the system at load time.
 await p.reload();await p.waitForFunction(()=>window.diaryReady);assert.equal(await attr(),'night');assert.equal(await p.evaluate(()=>DiaryTheme.current()),'auto');assert.equal(await p.evaluate(()=>DiaryTheme.effective()),'night');
 await p.emulateMedia({colorScheme:'light'});await p.reload();await p.waitForFunction(()=>window.diaryReady);assert.equal(await attr(),null,'light system loads the original look');
 // Picking a fixed theme again stops following the system.
 await p.locator('#open-settings').click();await p.locator('#authors-toggle').click();await p.locator('#theme-select').selectOption('ink');
 await p.emulateMedia({colorScheme:'dark'});await p.waitForTimeout(100);assert.equal(await attr(),'ink');
 console.log('PASS: auto theme follows the system live and at load, persists, and fixed themes ignore the system setting.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
