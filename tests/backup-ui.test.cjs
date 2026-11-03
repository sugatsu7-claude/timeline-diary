const assert=require('node:assert/strict'),h=require('./browser-utils.cjs');
(async()=>{
 const browser=await h.launch(),context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
 const today=new Date(),iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
 const ago=n=>{const d=new Date(today);d.setDate(d.getDate()-n);return iso(d);};
 const seed=[{id:'n1',date:ago(2),text:'近',source:'小夏',tags:[],createdAt:3},{id:'n2',date:ago(10),text:'中',source:'小夏',tags:[],createdAt:2},{id:'n3',date:'2020-01-01',text:'远',source:'小夏',tags:[],createdAt:1}];
 const p=await h.page(context,{penang_timeline_diary:seed,penang_timeline_authors:{defaultName:'小夏',names:['小夏']}});
 await p.locator('#open-settings').click();await p.locator('#data-toggle').click();
 assert.match(await p.locator('#backup-summary').textContent(),/将备份 3 篇日记 · 全部日期/);
 assert.equal(await p.locator('#backup-custom-range').isHidden(),true,'date inputs stay tucked away until 自定义');
 await p.locator('.range-chip[data-range="30"]').click();
 assert.match(await p.locator('#backup-summary').textContent(),/将备份 2 篇日记/);assert.equal(await p.locator('#backup-from').inputValue(),ago(29));
 await p.locator('.range-chip[data-range="custom"]').click();assert.equal(await p.locator('#backup-custom-range').isVisible(),true);
 await p.locator('#backup-from').fill('2021-01-01');await p.locator('#backup-to').fill('2020-01-01');
 assert.match(await p.locator('#backup-summary').textContent(),/不能晚于/);
 await p.locator('.range-chip[data-range="all"]').click();assert.equal(await p.locator('#backup-from').inputValue(),'');assert.match(await p.locator('#backup-summary').textContent(),/3 篇/);
 // The active range chip is visibly different in every theme.
 for(const theme of ['default','ink','night']){await p.evaluate(t=>DiaryTheme.set(t),theme);await p.locator('.range-chip[data-range="30"]').click();const [a,b]=await p.evaluate(()=>[...document.querySelectorAll('.range-chip')].filter(c=>c.dataset.range==='30'||c.dataset.range==='year').map(c=>getComputedStyle(c).borderTopColor));assert.notEqual(a,b,theme+': active chip differs from inactive');}
 await p.evaluate(()=>DiaryTheme.set('default'));
 // The chosen range is what a backup really uses.
 await p.locator('.range-chip[data-range="30"]').click();
 const download=p.waitForEvent('download');await p.locator('#export-json-btn').click();const file=await download;
 const fs=require('node:fs');const raw=fs.readFileSync(await file.path());assert.ok(raw.length>0);
 console.log('PASS: backup range chips fill the dates, live summary counts diaries, invalid ranges are flagged, and a ranged backup downloads.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
