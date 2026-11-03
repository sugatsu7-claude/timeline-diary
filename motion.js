// diary-release: 2026.11.03.14
/* Native scrolling, bounded one-shot reveals, and quiet feedback. No network work. */
(function () {
  'use strict';
  var root=document.documentElement,toolbar=document.querySelector('.toolbar');
  var progress=document.getElementById('reading-progress'),preference=matchMedia('(prefers-reduced-motion: reduce)');
  var animations=new Set(),activeAnimations=new WeakMap(),readingRows=new Set(),geometry=new WeakMap();
  var nativeReading=!!(window.CSS&&CSS.supports('animation-timeline: view()')&&CSS.supports('view-timeline-name: --diary-reading')&&CSS.supports('animation-range: cover 0% cover 100%')&&CSS.supports('animation-duration: auto'));
  var frame=0,idleTimer,lastY=window.scrollY,direction=0,distance=0,compact=false;
  var maxScroll=0,geometryDirty=true,viewportHeight=innerHeight,readingTop=76,lastReadingTime=0;
  var savedTimer=0,arrivalTimer=0,arrivalMax=0,returnToken=0,savedRow=null;
  function reduced(){return preference.matches;}
  function blocked(){return document.hidden||document.getElementById('sheet').classList.contains('open')||!document.getElementById('settings-drawer').hidden||document.getElementById('filter-panel').classList.contains('open')||!!document.querySelector('dialog[open]')||!!document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')||(window.visualViewport&&window.visualViewport.height<innerHeight-100);}
  function setCompact(value){if(compact===value)return;compact=value;toolbar.classList.toggle('is-compact',value);}
  function measure(){geometryDirty=true;schedule();}
  function measureGeometry(){
    // All geometry reads happen together, only after layout changes. Never interleave
    // row measurements with style writes during ordinary scrolling.
    var y=window.scrollY;
    viewportHeight=innerHeight;readingTop=toolbar.offsetTop+toolbar.offsetHeight+16;
    maxScroll=Math.max(0,document.documentElement.scrollHeight-viewportHeight);
    var measured=Array.from(document.querySelectorAll('#timeline .entry-row')).map(function(row){var box=row.getBoundingClientRect();return{row:row,top:box.top+y,height:box.height};});
    measured.forEach(function(item){
      var data=geometry.get(item.row)||{scale:1,opacity:1,shift:0,first:true};
      data.top=item.top;data.height=item.height;data.long=item.height>(viewportHeight-readingTop-16)*.75;
      geometry.set(item.row,data);item.row.classList.toggle('reading-long',data.long);
    });geometryDirty=false;
  }
  function tick(now){
    frame=0;if(geometryDirty)measureGeometry();
    var rawY=window.scrollY;if(rawY>maxScroll)maxScroll=Math.max(0,document.documentElement.scrollHeight-viewportHeight);
    var y=Math.max(0,Math.min(rawY,maxScroll)),delta=y-lastY;lastY=y;
    var settling=updateReading(now,y);
    progress.style.transform='scaleX('+(maxScroll?Math.min(1,y/maxScroll):0)+')';
    if(reduced()||blocked()||savedRow||y<72){setCompact(false);direction=0;distance=0;}
    else if(Math.abs(delta)>=1){var next=delta>0?1:-1;if(next!==direction){distance=0;direction=next;}distance+=Math.abs(delta);if(distance>(direction>0?28:18)){setCompact(direction>0);distance=0;}}
    if(settling)schedule();
  }
  function smooth(value){value=Math.max(0,Math.min(1,value));return value*value*(3-2*value);}
  function updateReading(now,y){
    if(nativeReading||reduced()||blocked()){lastReadingTime=0;return false;}
    var dt=lastReadingTime?Math.max(0,now-lastReadingTime):16;lastReadingTime=now;
    var alpha=1-Math.exp(-dt/55),settling=false,changes=[];
    readingRows.forEach(function(row){
      var data=geometry.get(row);if(!data)return;
      var phase=(viewportHeight-16-(data.top-y))/Math.max(1,viewportHeight-readingTop-16+data.height);
      var scale=1,opacity=1,shift=0;
      if(!data.long&&phase<.32){var enter=1-smooth(phase/.32);scale=1-enter*.11;opacity=1-enter*.68;shift=enter*34;}
      else if(!data.long&&phase>.68){var exit=smooth((phase-.68)/.32);scale=1-exit*.08;opacity=1-exit*.5;shift=-exit*22;}
      // Prime a capsule before it reaches the screen; then gently settle changes.
      var prime=data.first&&(data.top-y>=viewportHeight||data.top+data.height-y<=0);data.first=false;
      var nextScale=prime?scale:data.scale+(scale-data.scale)*alpha;
      var nextOpacity=prime?opacity:data.opacity+(opacity-data.opacity)*alpha;
      var nextShift=prime?shift:data.shift+(shift-data.shift)*alpha;
      if(Math.abs(nextScale-scale)<.00025)nextScale=scale;else settling=true;
      if(Math.abs(nextOpacity-opacity)<.001)nextOpacity=opacity;else settling=true;
      if(Math.abs(nextShift-shift)<.08)nextShift=shift;else settling=true;
      if(Math.abs(nextScale-data.scale)>.00005||Math.abs(nextOpacity-data.opacity)>.0005||Math.abs(nextShift-data.shift)>.02)changes.push({row:row,scale:nextScale,opacity:nextOpacity,shift:nextShift});
      data.scale=nextScale;data.opacity=nextOpacity;data.shift=nextShift;
    });
    changes.forEach(function(item){item.row.style.setProperty('--reading-scale',item.scale.toFixed(4));item.row.style.setProperty('--reading-opacity',item.opacity.toFixed(3));item.row.style.setProperty('--reading-shift',item.shift.toFixed(2)+'px');});
    return settling;
  }
  var readingObserver='IntersectionObserver' in window?new IntersectionObserver(function(records){
    records.forEach(function(record){var row=record.target;if(record.isIntersecting)readingRows.add(row);else readingRows.delete(row);row.classList.toggle('reading-active',record.isIntersecting);});schedule();
  },{rootMargin:'140px 0px 140px 0px'}):null;
  root.classList.toggle('reading-motion',!reduced());root.classList.add(nativeReading?'reading-native':'reading-fallback');
  // The capsule resting at the middle of the screen gets a slow halo (CSS) while scrolling is idle.
  var focusObserver='IntersectionObserver' in window?new IntersectionObserver(function(records){
    records.forEach(function(record){record.target.classList.toggle('reading-focus',record.isIntersecting);if(record.isIntersecting&&root.classList.contains('is-scrolling')&&window.DiaryFeedback)DiaryFeedback.snap();});
  },{rootMargin:'-42% 0px -42% 0px'}):null;
  function schedule(){if(!frame)frame=requestAnimationFrame(tick);}
  function animate(row,frames,options){
    if(reduced())return;
    var previous=activeAnimations.get(row);if(previous)previous.cancel();
    var opacity=row.style.opacity,transform=row.style.transform,start=null,id=0,done=false;
    var from=Number(frames[0].opacity),to=Number(frames[1].opacity),move=frames[0].transform?16:0;
    function restore(){row.style.opacity=opacity;if(move)row.style.transform=transform;}
    var effect={cancel:function(){if(done)return;done=true;cancelAnimationFrame(id);restore();animations.delete(effect);activeAnimations.delete(row);}};
    animations.add(effect);activeAnimations.set(row,effect);
    row.style.opacity=String(from);if(move)row.style.transform='translateY('+move+'px)';
    function draw(now){
      if(done)return;
      if(reduced()||document.hidden||!row.isConnected){effect.cancel();return;}
      if(start===null)start=now;
      var fraction=Math.min(1,Math.max(0,(now-start)/options.duration)),ease=1-Math.pow(1-fraction,3);
      row.style.opacity=String(from+(to-from)*ease);
      if(move)row.style.transform='translateY('+(move*(1-ease)).toFixed(3)+'px)';
      if(fraction>=1){effect.cancel();return;}id=requestAnimationFrame(draw);
    }
    id=requestAnimationFrame(draw);
  }
  function timelineChanged(container,filterChanged){
    if(readingObserver)readingObserver.disconnect();if(focusObserver)focusObserver.disconnect();readingRows.clear();
    if(filterChanged)animate(container,[{opacity:.7},{opacity:1}],{duration:260});
    container.querySelectorAll('.entry-row').forEach(function(row){if(focusObserver)focusObserver.observe(row);if(readingObserver)readingObserver.observe(row);else readingRows.add(row);});
    measure();
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
  if('ResizeObserver' in window){new ResizeObserver(measure).observe(document.body);new ResizeObserver(function(){measure();var panel=document.getElementById('filter-panel');if(panel.classList.contains('open'))panel.style.setProperty('--filter-top',(toolbar.getBoundingClientRect().bottom+6)+'px');}).observe(toolbar);}
  new MutationObserver(function(){if(blocked())setCompact(false);schedule();}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','hidden','open']});
  preference.addEventListener('change',function(){
    cancelReturn();releasePress();root.classList.toggle('reading-motion',!reduced());animations.forEach(function(animation){animation.cancel();});animations.clear();
    root.classList.remove('is-scrolling');lastReadingTime=0;setCompact(false);measure();
  });
  window.DiaryMotion={timelineChanged:timelineChanged,focusSaved:focusSaved,readingMode:nativeReading?'native':'fallback'};measure();
})();
