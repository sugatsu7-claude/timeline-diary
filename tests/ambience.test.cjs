const assert=require('node:assert/strict'),h=require('./browser-utils.cjs');
// A one-second silent WAV to stand in for a user's own music file.
const wav=(()=>{const n=8000,b=Buffer.alloc(44+n*2);b.write('RIFF',0);b.writeUInt32LE(36+n*2,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);return b;})();
(async()=>{
 const browser=await h.launch(),context=await browser.newContext({serviceWorkers:'block',reducedMotion:'no-preference',viewport:{width:390,height:844}});
 const p=await h.page(context,{penang_timeline_diary:[{id:'a1',date:'2026-11-01',text:'雨天',source:'小夏',tags:['日常'],createdAt:1}],penang_timeline_authors:{defaultName:'小夏',names:['小夏']}});
 const st=()=>p.evaluate(()=>({...DiaryAmbience.stats,running:DiaryAmbience.isRunning(),playing:DiaryAmbience.playing()}));
 const tapGutter=async()=>{await p.mouse.click(8,520);await p.waitForTimeout(120);};
 // Off by default: no music, no ripples, options hidden.
 await p.evaluate(()=>DiaryTheme.set('ink'));assert.equal((await st()).running,false,'off by default');
 await tapGutter();assert.equal(await p.locator('.ambience-ripple').count(),0);
 // Turning it on outside the ink theme waits for the theme.
 await p.evaluate(()=>DiaryTheme.set('default'));
 await p.locator('#open-settings').click();await p.locator('#feedback-toggle').click();
 assert.equal(await p.locator('#ambience-options').isHidden(),true);
 await p.locator('#ambience-toggle').check();
 assert.equal((await st()).running,false);assert.match(await p.locator('#ambience-note').textContent(),/切换到「水墨国风」/);
 assert.equal(await p.locator('#ambience-options').isVisible(),true,'music options appear once it is on');
 await p.evaluate(()=>DiaryTheme.set('ink'));await p.waitForTimeout(150);
 let s=await st();assert.equal(s.running,true,'runs in the ink theme');assert.equal(s.playing,'guqin','guqin is the default music');
 await p.waitForFunction(()=>DiaryAmbience.stats.notes>0,{},{timeout:6000});
 // 「试一下」previews a bird call, an ink bird and a drop.
 await p.locator('#feedback-test').click();await p.waitForTimeout(100);assert.equal((await st()).birds,1);assert.equal(await p.locator('.ambience-bird').count(),1);
 // No music.
 await p.locator('#ambience-music').selectOption('off');await p.waitForTimeout(100);assert.equal((await st()).playing,'off');
 // Your own music: stored on the device, shown by name, survives the image clean-up tool.
 await p.locator('#ambience-music').selectOption('mine');await p.locator('#ambience-mine').waitFor({state:'visible'});
 await p.locator('#ambience-file').setInputFiles({name:'山水.wav',mimeType:'audio/wav',buffer:wav});
 await p.waitForFunction(()=>/山水\.wav/.test(document.getElementById('ambience-file-status').textContent));
 s=await st();assert.equal(s.playing,'mine');assert.ok(s.mineStarts>=1);
 assert.equal(await p.evaluate(async()=>!!(await MediaAssets.store('get','ambience-music'))),true);
 await p.evaluate(async()=>{const now=Date.now;Date.now=()=>now()+30*864e5;try{await DiaryBackup.cleanup();}finally{Date.now=now;}});
 assert.equal(await p.evaluate(async()=>!!(await MediaAssets.store('get','ambience-music'))),true,'cleanup keeps the chosen music');
 // Volume slider.
 await p.locator('#ambience-volume').fill('30');assert.equal(await p.locator('#ambience-volume-value').textContent(),'30');
 await p.locator('#close-settings').click();
 // Tapping empty background: ripple + drop. Tapping a card: nothing.
 await tapGutter();assert.equal(await p.locator('.ambience-ripple').count(),1);assert.equal((await st()).drops,1);
 await p.locator('.entry-card').first().click({position:{x:120,y:60}});await p.waitForTimeout(100);assert.equal((await st()).drops,1,'cards do not ripple');
 // Saving a diary stamps it with a thump.
 await p.locator('#add-fab').click();await p.locator('#entry-text').fill('檐下听雨');await p.locator('#sheet-save').click();await h.saved(p);
 await p.waitForFunction(()=>DiaryAmbience.stats.thumps>=1,{},{timeout:5000});
 // Other themes stay quiet; choices are remembered.
 await p.evaluate(()=>DiaryTheme.set('night'));await p.waitForTimeout(100);assert.equal((await st()).running,false);
 await p.reload();await p.waitForFunction(()=>window.diaryReady);await p.evaluate(()=>DiaryTheme.set('ink'));await p.waitForTimeout(200);
 s=await st();assert.equal(s.running,true,'remembered after reload');assert.equal(s.playing,'mine');
 assert.equal(await p.evaluate(()=>document.getElementById('ambience-volume').value),'30');
 // Reduced motion keeps the visuals out.
 await p.emulateMedia({reducedMotion:'reduce'});await tapGutter();assert.equal(await p.locator('.ambience-ripple').count(),0);
 // The offline preview renders real sound.
 const peak=await p.evaluate(async()=>{const b=await DiaryAmbience.renderPreview(8),d=b.getChannelData(0);let m=0;for(const v of d)m=Math.max(m,Math.abs(v));return m;});
 assert.ok(peak>0.05,'voices produce audible output');
 console.log('PASS: soundscape is off by default, ink-only, guqin by default, no-music and own-music modes (stored locally, kept by cleanup), volume persists, ripples on empty background only, thumps on save.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
