// diary-release: 2026.11.03.6
/* Interface themes. The choice is stored on this device and applied as html[data-theme]. */
(function () {
  'use strict';
  var KEY='theme',root=document.documentElement;
  function valid(value){return value==='ink'?'ink':'default';}
  function apply(value){if(value==='ink')root.setAttribute('data-theme','ink');else root.removeAttribute('data-theme');}
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
