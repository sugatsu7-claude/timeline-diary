// diary-release: 2026.11.03.13
/* Interface themes. The choice is stored on this device and applied as html[data-theme]. */
(function () {
  'use strict';
  var KEY='theme',root=document.documentElement;
  function valid(value){return value==='ink'||value==='night'?value:'default';}
  function apply(value){
    if(value==='ink'||value==='night')root.setAttribute('data-theme',value);else root.removeAttribute('data-theme');
    var meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute('content',{ink:'#ECF0EF',night:'#14181B'}[value]||'#1B3A6B');
    // The built-in background follows the theme (a user-chosen photo is left alone).
    if(typeof applyBackground==='function'&&typeof appSettings!=='undefined'&&!appSettings.localBackground&&!appSettings.bgUrl)applyBackground('');
  }
  var current='default';
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
  window.DiaryTheme={current:function(){return current;},set:function(value){current=valid(value);apply(current);if(select)select.value=current;}};
})();
