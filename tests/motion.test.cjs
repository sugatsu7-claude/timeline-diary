const assert=require('node:assert/strict'),h=require('./browser-utils.cjs');
(async()=>{
 const browser=await h.launch(),context=await browser.newContext({serviceWorkers:'block',reducedMotion:'no-preference',viewport:{width:390,height:844}});
 const seed=Array.from({length:65},(_,i)=>({id:'motion'+i,date:'2026-11-01',text:'日记 '+i+'\n\n慢慢记录生活。',source:'小夏',tags:i%2?['散步']:['日常'],createdAt:65-i}));
 const p=await h.page(context,{penang_timeline_diary:seed,penang_timeline_authors:{defaultName:'小夏',names:['小夏']}});
 let remote=0;await p.route('https://worker.test/**',r=>{remote++;return r.abort();});
 await p.evaluate(()=>{window.reveals=[];const active=new WeakSet();new MutationObserver(records=>records.forEach(record=>{const row=record.target;if(!row.matches('.entry-row'))return;if(row.style.opacity){if(!active.has(row)){active.add(row);window.reveals.push(row.dataset.entryId);}}else active.delete(row);})).observe(document.getElementById('timeline'),{subtree:true,attributes:true,attributeFilter:['style']});});
 async function scroll(y){await p.evaluate(y=>{scrollTo(0,y);return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));},y);await p.waitForTimeout(260);}
 await scroll(550);assert.equal(await p.locator('.toolbar').evaluate(el=>el.classList.contains('is-compact')),true);
 assert.ok(await p.locator('#reading-progress').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).a>0));
 await scroll(400);assert.equal(await p.locator('.toolbar').evaluate(el=>el.classList.contains('is-compact')),false);
 await scroll(900);await scroll(1200);const reveals=await p.evaluate(()=>window.reveals.slice());assert.equal(reveals.length,0,'scrolling must not start a second JS entrance animation');
 await scroll(400);await scroll(1200);const repeated=await p.evaluate(()=>window.reveals);assert.equal(repeated.length,0,'repeat scrolling stays free of JS entrance animations');
 await p.locator('#filter-toggle').click();await p.waitForTimeout(300);const toolbar=await p.locator('.toolbar').boundingBox(),panel=await p.locator('#filter-panel').boundingBox();assert.ok(panel.y>=toolbar.y+toolbar.height,'expanded filters stay below toolbar');assert.equal(await p.locator('.toolbar').evaluate(el=>el.classList.contains('is-compact')),false);await p.locator('#close-filters').click();
 // Loading retains old nodes, grows only one batch and keeps the page inside the viewport.
 await p.evaluate(()=>window.firstRow=document.querySelector('.entry-row'));await p.locator('#load-more-entries').click();assert.equal(await p.locator('.entry-row').count(),60);assert.equal(await p.evaluate(()=>window.firstRow===document.querySelector('.entry-row')),true);
 for(const width of [320,390,430]){await p.setViewportSize({width,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 await p.setViewportSize({width:390,height:844});await scroll(0);await p.locator('[data-entry-id="motion0"] [aria-label="编辑日记"]').click();await p.locator('#entry-text').fill('修改后的日记');await p.locator('#sheet-save').click();await h.saved(p);await p.waitForFunction(()=>document.querySelector('[data-entry-id="motion0"]').classList.contains('saved-highlight'));const saved=await p.locator('[data-entry-id="motion0"]').boundingBox();assert.ok(saved.y>=0&&saved.y<844);assert.equal(await p.locator('#sheet').evaluate(el=>getComputedStyle(el).visibility),'hidden');assert.equal(await p.locator('#sheet-backdrop').evaluate(el=>getComputedStyle(el).visibility),'hidden');
 // A new gesture cancels a scheduled return; reduced motion also stops running animations.
 await p.evaluate(()=>{DiaryMotion.focusSaved('motion59');window.dispatchEvent(new Event('wheel'));});await p.waitForTimeout(380);assert.equal(await p.locator('[data-entry-id="motion59"]').evaluate(el=>el.classList.contains('saved-highlight')),false);
 // Keyboard dismissal is slower than the panel on some iPhones: keep the return pending.
 await p.evaluate(()=>{Object.defineProperty(visualViewport,'height',{configurable:true,get:()=>100});DiaryMotion.focusSaved('motion59');setTimeout(()=>{delete visualViewport.height;visualViewport.dispatchEvent(new Event('resize'));},500);});
 await p.waitForFunction(()=>document.querySelector('[data-entry-id="motion59"]').classList.contains('saved-highlight'));
 const keyboardSaved=await p.locator('[data-entry-id="motion59"]').boundingBox();assert.ok(keyboardSaved.y>=0&&keyboardSaved.y<844,'return resumes after keyboard dismissal');
 await p.emulateMedia({reducedMotion:'reduce'});const before=await p.evaluate(()=>window.reveals.length);await scroll(1700);assert.equal(await p.locator('.toolbar').evaluate(el=>el.classList.contains('is-compact')),false);assert.equal(await p.evaluate(()=>window.reveals.length),before);assert.equal(await p.locator('#sheet').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');assert.equal(remote,0);
 console.log('PASS: native scroll feedback, direction hysteresis, scroll-driven capsules without stacked entrance animations, filter alignment, stable batch nodes/mobile widths, saved return/keyboard dismissal and gesture cancellation, reduced motion, no Worker requests.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
