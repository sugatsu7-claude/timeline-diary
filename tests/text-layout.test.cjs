const assert=require('node:assert/strict'),h=require('./browser-utils.cjs');
(async()=>{
 const browser=await h.launch(),context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
 const long='这是一段很长很长的文字，会在手机屏幕上自动换行成为好几行，用来观察行与行之间的间距是否紧凑。再多写一些字让它至少换行三次，确保测量可靠。';
 const text=long+'\n短行\n\n'+'尾';
 const p=await h.page(context,{penang_timeline_diary:[{id:'l1',date:'2026-11-01',text,source:'小夏',tags:[],createdAt:1}],penang_timeline_authors:{defaultName:'小夏',names:['小夏']}});
 assert.equal(await p.locator('.entry-text-inline').evaluate(el=>el.textContent),text,'line breaks are preserved in the text');
 const ratio=()=>p.evaluate(()=>{const el=document.querySelector('.entry-text-inline');return parseFloat(getComputedStyle(el).lineHeight)/parseFloat(getComputedStyle(el).fontSize);});
 assert.ok(Math.abs(await ratio()-1.7)<.01,'default theme also uses the 1.7 line height');
 const gap=await p.evaluate(()=>{const l=document.querySelectorAll('.entry-line');return l[1].getBoundingClientRect().top-l[0].getBoundingClientRect().bottom;});assert.ok(gap>2&&gap<12,'default theme keeps the Enter gap');
 await p.evaluate(()=>DiaryTheme.set('ink'));await p.waitForTimeout(150);
 const m=await p.evaluate(()=>{const lines=[...document.querySelectorAll('.entry-line')];const first=lines[0],second=lines[1],blank=lines[2];const lh=parseFloat(getComputedStyle(first).lineHeight);
  return {lh,firstH:first.getBoundingClientRect().height,gap:second.getBoundingClientRect().top-first.getBoundingClientRect().bottom,blankH:blank.getBoundingClientRect().height,count:lines.length};});
 assert.equal(m.count,4);assert.ok(m.firstH/m.lh>=2.9,'long paragraph wraps to several lines');
 assert.ok(m.gap>2&&m.gap<12,'Enter breaks add a small extra gap');assert.ok(m.blankH>=m.lh-1,'blank line keeps one line of height');
 assert.ok(m.lh/parseFloat(await p.locator('.entry-text-inline').evaluate(el=>getComputedStyle(el).fontSize))<1.8,'soft-wrapped lines are tighter than before (was 2.05)');
 console.log('PASS: text keeps line breaks; ink theme tightens soft-wrapped lines while Enter breaks keep their gap.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
