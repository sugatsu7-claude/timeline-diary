// diary-release: 2026.11.05.1
/* Optional haptics and soft sounds. Off by default; nothing runs until the user turns it on. */
(function () {
  'use strict';
  var KEY='feedback',state={haptics:false,sound:false},ctx=null,lastSnap=0,lastTick=0;
  function load(){try{var v=DiaryStore.config(KEY,{});state={haptics:v.haptics===true,sound:v.sound===true};}catch(e){}}
  function save(){return DiaryStore.setConfig(KEY,state);}
  function reduced(){return matchMedia('(prefers-reduced-motion: reduce)').matches;}
  function canVibrate(){return typeof navigator.vibrate==='function';}
  function buzz(pattern){
    if(!state.haptics||reduced())return;
    if(canVibrate())navigator.vibrate(pattern);
  }
  function audio(){
    if(ctx)return ctx;
    var C=window.AudioContext||window.webkitAudioContext;if(!C)return null;
    try{ctx=new C();}catch(e){ctx=null;}return ctx;
  }
  function note(freq,start,length,volume,type){
    var c=audio();if(!c)return;
    var osc=c.createOscillator(),gain=c.createGain(),t=c.currentTime+start;
    osc.type=type||'sine';osc.frequency.setValueAtTime(freq,t);
    gain.gain.setValueAtTime(0.0001,t);gain.gain.exponentialRampToValueAtTime(volume,t+0.008);gain.gain.exponentialRampToValueAtTime(0.0001,t+length);
    osc.connect(gain);gain.connect(c.destination);osc.start(t);osc.stop(t+length+0.02);
  }
  function play(kind){
    if(!state.sound||reduced())return;var c=audio();if(!c)return;if(c.state==='suspended')c.resume();
    var ink=document.documentElement.getAttribute('data-theme')==='ink';
    // Ink theme: a soft wooden knock and plucked-string pentatonic notes instead of bright beeps.
    if(kind==='tick')ink?note(420,0,0.07,0.07,'triangle'):note(1250,0,0.035,0.05);
    else if(kind==='success')ink?(note(587,0,0.34,0.06),note(880,0.12,0.5,0.05)):(note(660,0,0.14,0.07),note(880,0.09,0.2,0.07));
    else if(kind==='warn')ink?note(196,0,0.3,0.07):note(300,0,0.16,0.08);
  }
  var api={
    tick:function(){var now=Date.now();if(now-lastTick<45)return;lastTick=now;buzz(8);play('tick');},
    // Called when a new capsule settles at the reading centre while scrolling.
    snap:function(){var now=Date.now();if(now-lastSnap<140)return;lastSnap=now;buzz(6);},
    success:function(){buzz([12,40,18]);play('success');},
    warn:function(){buzz([30,50,30]);play('warn');},
    toast:function(message){api[/未|失败|不能|不再|请先|冲突|已经存在|错误/.test(String(message))?'warn':'success']();},
    state:function(){return{haptics:state.haptics,sound:state.sound,vibrate:canVibrate()};}
  };
  window.DiaryFeedback=api;
  // Unlock audio on the first touch after the user enabled sound.
  function unlock(){if(state.sound){var c=audio();if(c&&c.state==='suspended')c.resume();}}
  document.addEventListener('pointerdown',function(event){
    unlock();
    var target=event.target.closest&&event.target.closest('button,.tag-chip,.fab');
    if(target&&!target.disabled&&!target.closest('#feedback-panel'))api.tick();
  },{passive:true});
  function bind(){
    var toggle=document.getElementById('feedback-toggle');if(!toggle)return;
    toggle.setAttribute('role','button');toggle.tabIndex=0;toggle.setAttribute('aria-controls','feedback-panel');toggle.setAttribute('aria-expanded','false');
    toggle.onclick=function(){toggleSettingsGroup('feedback');};
    toggle.onkeydown=function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle.click();}};
    var haptics=document.getElementById('feedback-haptics'),sound=document.getElementById('feedback-sound'),test=document.getElementById('feedback-test'),note=document.getElementById('feedback-note');
    haptics.checked=state.haptics;sound.checked=state.sound;
    if(!canVibrate())haptics.closest('label').style.display='none';
    note.textContent=canVibrate()?'此设备支持系统震动。':'iPhone/iPad 的网页不支持震动，这里只提供提示音。';
    haptics.onchange=async function(){state.haptics=haptics.checked;try{await save();}catch(e){}if(state.haptics)buzz(15);};
    sound.onchange=async function(){state.sound=sound.checked;try{await save();}catch(e){}if(state.sound){unlock();play('success');}};
    test.onclick=function(){api.success();};
  }
  load();bind();
})();
