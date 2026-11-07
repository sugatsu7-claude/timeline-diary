// diary-release: 2026.11.07.5
/* Interface themes. The choice is stored on this device and applied as html[data-theme]. */
(function () {
  'use strict';
  var KEY='theme',root=document.documentElement;
  var dark=window.matchMedia?matchMedia('(prefers-color-scheme: dark)'):null;
  function valid(value){return value==='ink'||value==='night'||value==='auto'?value:'default';}
  // 'auto' follows the phone: dark system -> 夜间, light system -> 原样式.
  function resolve(value){return value==='auto'?(dark&&dark.matches?'night':'default'):value;}
  function apply(choice){
    var value=resolve(choice);
    if(value==='ink'||value==='night')root.setAttribute('data-theme',value);else root.removeAttribute('data-theme');
    var meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute('content',{ink:'#ECF0EF',night:'#14181B'}[value]||'#1B3A6B');
    // The built-in background follows the theme (a user-chosen photo is left alone).
    if(typeof applyBackground==='function'&&typeof appSettings!=='undefined'&&!appSettings.localBackground&&!appSettings.bgUrl)applyBackground('');
  }
  var current='default';
  function onSystemChange(){if(current==='auto')apply(current);}
  if(dark){if(dark.addEventListener)dark.addEventListener('change',onSystemChange);else if(dark.addListener)dark.addListener(onSystemChange);}
  try{current=valid(DiaryStore.config(KEY,'default'));}catch(e){}
  apply(current);
  var select=document.getElementById('theme-select');
  if(select){
    select.value=current;
    select.onchange=async function(){
      current=valid(select.value);apply(current);
      try{await DiaryStore.setConfig(KEY,current);}catch(e){showToast('主题已切换，但未能保存：'+e.message);}
    };
  }
  window.DiaryTheme={current:function(){return current;},effective:function(){return resolve(current);},set:function(value){current=valid(value);apply(current);if(select)select.value=current;}};
})();
