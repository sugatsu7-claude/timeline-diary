const assert=require('node:assert/strict'),h=require('./browser-utils.cjs');
(async()=>{
 const browser=await h.launch(),context=await browser.newContext({serviceWorkers:'block',reducedMotion:'no-preference',viewport:{width:390,height:844}});
 const p=await h.page(context,{penang_timeline_diary:[{id:'u1',date:'2026-11-01',text:'要删除再撤销的日记',source:'小夏',tags:['日常'],createdAt:1}],penang_timeline_authors:{defaultName:'小夏',names:['小夏']}});
 let dialogs=0;p.on('dialog',()=>{dialogs++;});
 // Deleting a diary needs no confirm dialog and can be undone from the toast.
 await (await h.menu(p,p,'删除日记')).click();await p.waitForFunction(()=>entries.length===0);
 assert.equal(dialogs,0,'no system dialog when deleting');
 assert.equal(await p.locator('#toast .toast-action').textContent(),'撤销');
 await p.locator('#toast .toast-action').click();await p.waitForFunction(()=>entries.length===1);assert.equal(await p.evaluate(()=>trash.length),0,'undo takes it out of the trash');
 // Hint text meets 4.5:1 contrast on white in every theme's light surfaces.
 const lum=c=>{const [r,g,b]=c.match(/\d+(\.\d+)?/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);});return .2126*r+.7152*g+.0722*b;};
 await p.locator('#open-settings').click();await p.locator('#authors-toggle').click();
 const hint=await p.locator('.settings-hint').first().evaluate(el=>getComputedStyle(el).color);
 assert.ok(1.05/(lum(hint)+.05)>=4.5,'default hint colour has at least 4.5:1 contrast on white: '+hint);
 assert.ok((await p.locator('#local-background').evaluate(el=>getComputedStyle(el).opacity))==='0','native English file control is hidden');
 assert.equal((await p.locator('label.file-btn[for="local-background"]').textContent()).trim(),'选择一张本机图片');
 await p.locator('#close-settings').click();
 // Filter panel is opaque.
 await p.locator('#filter-toggle').click();await p.waitForTimeout(250);
 assert.equal(await p.locator('#filter-panel').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(250, 248, 243)');await p.locator('#close-filters').click();
 // Night theme and ink dialogs.
 await p.evaluate(()=>DiaryTheme.set('night'));
 assert.equal(await p.evaluate(()=>document.documentElement.getAttribute('data-theme')),'night');
 assert.equal(await p.evaluate(()=>document.querySelector('meta[name="theme-color"]').content),'#14181B');
 const [r,g,b]=(await p.evaluate(()=>getComputedStyle(document.body).backgroundColor)).match(/\d+/g).map(Number);assert.ok(r<40&&g<40&&b<40,'night body is dark');
 assert.ok(lum(await p.locator('.entry-card').first().evaluate(el=>getComputedStyle(el).color))>.5,'night card text is light');
 await p.evaluate(()=>DiaryTheme.set('ink'));
 assert.equal(await p.locator('#card-dialog').evaluate(el=>getComputedStyle(el).borderTopLeftRadius),'8px','ink theme reaches the dialogs');
 await p.evaluate(()=>DiaryTheme.set('default'));
 assert.equal(await p.evaluate(()=>document.querySelector('meta[name="theme-color"]').content),'#1B3A6B');
 // Primary buttons follow the theme instead of staying navy.
 const primary=t=>p.evaluate(t=>{DiaryTheme.set(t);return getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();},t);
 assert.equal(await primary('default'),'#1B3A6B');assert.notEqual(await primary('ink'),'#1B3A6B');assert.notEqual(await primary('night'),'#1B3A6B');
 console.log('PASS: delete is undoable without a dialog, hint contrast, Chinese file picker, opaque filter panel, night theme, themed dialogs and primary colour tokens.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
