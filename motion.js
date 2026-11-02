// diary-release: 2026.11.02.2
/* Native scrolling, bounded one-shot reveals, and quiet feedback. No network work. */
(function () {
  'use strict';
  var root=document.documentElement,toolbar=document.querySelector('.toolbar');
  var progress=document.getElementById('reading-progress'),preference=matchMedia('(prefers-reduced-motion: reduce)');
  var seen=new Set(),animations=new Set(),observer;
  var frame=0,idleTimer,lastY=window.scrollY,direction=0,distance=0,compact=false;
  var maxScroll=0,savedTimer=0,arrivalTimer=0,arrivalMax=0,returnToken=0,savedRow=null;
  function reduced(){return preference.matches;}
  function blocked(){return document.hidden||document.getElementById('sheet').classList.contains('open')||!document.getElementById('settings-drawer').hidden||document.getElementById('filter-panel').classList.contains('open')||!!document.querySelector('dialog[open]')||!!document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')||(window.visualViewport&&window.visualViewport.height<innerHeight-100);}
  function setCompact(value){if(compact===value)return;compact=value;toolbar.classList.toggle('is-compact',value);}
  function measure(){schedule();}
  function tick(){
    frame=0;maxScroll=Math.max(0,document.documentElement.scrollHeight-innerHeight);var y=Math.max(0,Math.min(window.scrollY,maxScroll)),delta=y-lastY;lastY=y;
    progress.style.transform='scaleX('+(maxScroll?Math.min(1,y/maxScroll):0)+')';
    if(reduced()||blocked()||savedRow||y<72){setCompact(false);direction=0;distance=0;return;}
    if(Math.abs(delta)<1)return;
    var next=delta>0?1:-1;if(next!==direction){distance=0;direction=next;}distance+=Math.abs(delta);
    if(distance>(direction>0?28:18)){setCompact(direction>0);distance=0;}
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(tick);}
  function animate(row,frames,options){
    if(reduced()||!row.animate)return;
    var animation=row.animate(frames,options);animations.add(animation);
    animation.finished.catch(function(){}).finally(function(){animations.delete(animation);});
  }
  function reveal(row){
    var id=row.dataset.entryId;if(seen.has(id))return;seen.add(id);
    animate(row,[{opacity:.3,transform:'translateY(16px)'},{opacity:1,transform:'translateY(0)'}],{duration:480,easing:'cubic-bezier(.22,.75,.25,1)'});
  }
  if('IntersectionObserver' in window)observer=new IntersectionObserver(function(records){
    records.forEach(function(record){if(record.isIntersecting){observer.unobserve(record.target);reveal(record.target);}});
  },{threshold:0,rootMargin:'0px 0px -96px 0px'});
  function timelineChanged(container,filterChanged,focusId){
    if(observer)observer.disconnect();
    if(filterChanged)animate(container,[{opacity:.5},{opacity:1}],{duration:260,easing:'ease-out'});
    var rows=container.querySelectorAll('.entry-row');
    rows.forEach(function(row){
      var box=row.getBoundingClientRect(),visible=box.bottom>0&&box.top<innerHeight-16;
      if(reduced()||!observer||seen.has(row.dataset.entryId)||row.dataset.entryId===focusId){seen.add(row.dataset.entryId);return;}
      if(visible)reveal(row);
      else observer.observe(row);
    });measure();
  }
  function cancelReturn(){
    returnToken++;clearTimeout(savedTimer);clearTimeout(arrivalTimer);clearTimeout(arrivalMax);savedRow=null;
  }
  function arrived(){
    clearTimeout(arrivalTimer);clearTimeout(arrivalMax);if(!savedRow)return;
    var row=savedRow;savedRow=null;if(!row.isConnected)return;
    row.classList.add('saved-highlight');setTimeout(function(){row.classList.remove('saved-highlight');},2300);
  }
  function focusSaved(id){
    cancelReturn();var token=returnToken;
    function returnWhenReady(attempt){
      if(token!==returnToken)return;
      // iOS keyboard dismissal can outlast the sheet animation. Wait briefly,
      // while a new gesture still cancels this return immediately.
      if(blocked()){if(attempt<10)savedTimer=setTimeout(function(){returnWhenReady(attempt+1);},100);return;}
      var row=Array.from(document.querySelectorAll('[data-entry-id]')).find(function(el){return el.dataset.entryId===id;});if(!row)return;
      setCompact(false);savedRow=row;
      row.scrollIntoView({behavior:reduced()?'auto':'smooth',block:'center'});
      arrivalTimer=setTimeout(arrived,reduced()?0:160);arrivalMax=setTimeout(arrived,1400);
    }
    savedTimer=setTimeout(function(){returnWhenReady(0);},reduced()?0:340);
  }
  window.addEventListener('scroll',function(){
    schedule();
    if(!reduced()&&!blocked()){root.classList.add('is-scrolling');clearTimeout(idleTimer);idleTimer=setTimeout(function(){root.classList.remove('is-scrolling');},180);}
    if(savedRow){clearTimeout(arrivalTimer);arrivalTimer=setTimeout(arrived,140);}
  },{passive:true});
  // A new user gesture wins over a pending automatic return after saving.
  ['pointerdown','touchstart','wheel','keydown'].forEach(function(type){window.addEventListener(type,cancelReturn,{passive:true});});
  document.addEventListener('focusin',function(){if(blocked())setCompact(false);});
  document.addEventListener('visibilitychange',function(){if(document.hidden){cancelReturn();root.classList.remove('is-scrolling');}schedule();});
  window.addEventListener('resize',measure,{passive:true});window.visualViewport?.addEventListener('resize',schedule,{passive:true});
  if('ResizeObserver' in window){new ResizeObserver(measure).observe(document.body);new ResizeObserver(function(){var panel=document.getElementById('filter-panel');if(panel.classList.contains('open'))panel.style.setProperty('--filter-top',(toolbar.getBoundingClientRect().bottom+6)+'px');}).observe(toolbar);}
  new MutationObserver(function(){if(blocked())setCompact(false);}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','hidden','open']});
  preference.addEventListener('change',function(){
    cancelReturn();animations.forEach(function(animation){animation.cancel();});animations.clear();
    if(observer)observer.disconnect();root.classList.remove('is-scrolling');setCompact(false);schedule();
  });
  window.DiaryMotion={timelineChanged:timelineChanged,focusSaved:focusSaved};measure();
})();
