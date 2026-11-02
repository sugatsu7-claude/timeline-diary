// diary-release: 2026.11.02.3
/* Native scrolling, bounded one-shot reveals, and quiet feedback. No network work. */
(function () {
  'use strict';
  var root=document.documentElement,toolbar=document.querySelector('.toolbar');
  var progress=document.getElementById('reading-progress'),preference=matchMedia('(prefers-reduced-motion: reduce)');
  var seen=new Set(),animations=new Set(),activeAnimations=new WeakMap(),observer,readingObserver,readingRows=new Set();
  var frame=0,idleTimer,lastY=window.scrollY,direction=0,distance=0,compact=false;
  var maxScroll=0,savedTimer=0,arrivalTimer=0,arrivalMax=0,returnToken=0,savedRow=null;
  function reduced(){return preference.matches;}
  function blocked(){return document.hidden||document.getElementById('sheet').classList.contains('open')||!document.getElementById('settings-drawer').hidden||document.getElementById('filter-panel').classList.contains('open')||!!document.querySelector('dialog[open]')||!!document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')||(window.visualViewport&&window.visualViewport.height<innerHeight-100);}
  function setCompact(value){if(compact===value)return;compact=value;toolbar.classList.toggle('is-compact',value);}
  function measure(){schedule();}
  function tick(){
    frame=0;maxScroll=Math.max(0,document.documentElement.scrollHeight-innerHeight);var y=Math.max(0,Math.min(window.scrollY,maxScroll)),delta=y-lastY;lastY=y;
    updateReading();
    progress.style.transform='scaleX('+(maxScroll?Math.min(1,y/maxScroll):0)+')';
    if(reduced()||blocked()||savedRow||y<72){setCompact(false);direction=0;distance=0;return;}
    if(Math.abs(delta)<1)return;
    var next=delta>0?1:-1;if(next!==direction){distance=0;direction=next;}distance+=Math.abs(delta);
    if(distance>(direction>0?28:18)){setCompact(direction>0);distance=0;}
  }
  function updateReading(){
    if(reduced()||blocked())return;
    var top=toolbar.getBoundingClientRect().bottom+16,bottom=innerHeight-16,height=bottom-top,center=(top+bottom)/2;
    readingRows.forEach(function(row){
      var box=row.getBoundingClientRect();
      // Keep long paragraphs completely still; only short capsules respond at the edges.
      var distance=Math.abs(box.top+box.height/2-center)/Math.max(1,height*.6+box.height*.15);
      var edge=box.height>height*.75?0:Math.min(1,Math.max(0,(distance-.25)/.75));
      row.style.setProperty('--reading-scale',(1-edge*.045).toFixed(4));
      row.style.setProperty('--reading-opacity',(1-edge*.2).toFixed(3));
    });
  }
  if('IntersectionObserver' in window)readingObserver=new IntersectionObserver(function(records){
    records.forEach(function(record){if(record.isIntersecting)readingRows.add(record.target);else readingRows.delete(record.target);});schedule();
  },{rootMargin:'140px 0px 140px 0px'});
  root.classList.toggle('reading-motion',!reduced());
  function schedule(){if(!frame)frame=requestAnimationFrame(tick);}
  function animate(row,frames,options){
    if(reduced())return;
    var previous=activeAnimations.get(row);if(previous)previous.cancel();
    var opacity=row.style.opacity,transform=row.style.transform,start=performance.now(),id=0,done=false;
    var from=Number(frames[0].opacity),to=Number(frames[1].opacity),move=frames[0].transform?16:0;
    function restore(){row.style.opacity=opacity;if(move)row.style.transform=transform;}
    var effect={cancel:function(){if(done)return;done=true;cancelAnimationFrame(id);restore();animations.delete(effect);activeAnimations.delete(row);}};
    animations.add(effect);activeAnimations.set(row,effect);
    row.style.opacity=String(from);if(move)row.style.transform='translateY('+move+'px)';
    function draw(now){
      if(done)return;
      if(reduced()||document.hidden||!row.isConnected){effect.cancel();return;}
      var fraction=Math.min(1,(now-start)/options.duration),ease=1-Math.pow(1-fraction,3);
      row.style.opacity=String(from+(to-from)*ease);
      if(move)row.style.transform='translateY('+(move*(1-ease)).toFixed(3)+'px)';
      if(fraction>=1){effect.cancel();return;}id=requestAnimationFrame(draw);
    }
    id=requestAnimationFrame(draw);
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
    if(readingObserver)readingObserver.disconnect();readingRows.clear();
    if(filterChanged)animate(container,[{opacity:.5},{opacity:1}],{duration:260,easing:'ease-out'});
    var rows=container.querySelectorAll('.entry-row');
    rows.forEach(function(row){
      if(readingObserver)readingObserver.observe(row);
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
  var pressed=null,pressX=0,pressY=0;
  function releasePress(){if(pressed)pressed.classList.remove('touch-pressed');pressed=null;}
  // An explicit state also works on iOS, where :active alone is unreliable for touch.
  document.addEventListener('pointerdown',function(event){
    var target=event.target.closest('button,.tag-chip,.fab');if(!target||target.disabled)return;
    releasePress();pressed=target;pressX=event.clientX;pressY=event.clientY;target.classList.add('touch-pressed');
  },{passive:true});
  document.addEventListener('pointermove',function(event){if(pressed&&Math.hypot(event.clientX-pressX,event.clientY-pressY)>10)releasePress();},{passive:true});
  ['pointerup','pointercancel'].forEach(function(type){document.addEventListener(type,releasePress,{passive:true});});
  document.addEventListener('focusin' ,function(){if(blocked())setCompact(false);});
  document.addEventListener('visibilitychange',function(){if(document.hidden){cancelReturn();releasePress();animations.forEach(function(effect){effect.cancel();});root.classList.remove('is-scrolling');}schedule();});
  window.addEventListener('resize',measure,{passive:true});window.visualViewport?.addEventListener('resize',schedule,{passive:true});
  if('ResizeObserver' in window){new ResizeObserver(measure).observe(document.body);new ResizeObserver(function(){var panel=document.getElementById('filter-panel');if(panel.classList.contains('open'))panel.style.setProperty('--filter-top',(toolbar.getBoundingClientRect().bottom+6)+'px');}).observe(toolbar);}
  new MutationObserver(function(){if(blocked())setCompact(false);schedule();}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','hidden','open']});
  preference.addEventListener('change',function(){
    cancelReturn();releasePress();root.classList.toggle('reading-motion',!reduced());animations.forEach(function(animation){animation.cancel();});animations.clear();
    if(observer)observer.disconnect();root.classList.remove('is-scrolling');setCompact(false);schedule();
  });
  window.DiaryMotion={timelineChanged:timelineChanged,focusSaved:focusSaved};measure();
})();
