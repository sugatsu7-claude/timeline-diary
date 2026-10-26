// diary-release: 2026.10.26.11
/* Names and subtitle belong to this browser; historical bylines are immutable here. */
(function () {
  'use strict';
  var KEY='penang_timeline_authors',DEFAULT_SUBTITLE='记录生活的每一天',config;
  try { config=DiaryStore.config(KEY,null); } catch (_) {}
  if(!config||typeof config!=='object')config={};
  config={defaultName:typeof config.defaultName==='string'?config.defaultName:'',names:Array.isArray(config.names)?config.names.filter(function(n){return typeof n==='string';}):[],hidden:Array.isArray(config.hidden)?config.hidden:[],subtitle:typeof config.subtitle==='string'?config.subtitle:''};
  function validate(name){name=name.trim();if(!name||name.length>100||name.includes(','))throw new Error('名字需为1至100个字符，不能包含英文逗号');return name;}
  function names(){return Array.from(new Set([config.defaultName].concat(config.names,entries.map(function(e){return sourceName(e.source);})).filter(Boolean)));}
  function options(current){return names().filter(function(n){return !config.hidden.includes(n)||n===current;});}
  async function persist(next){await DiaryStore.setConfig(KEY,next);config=next;render();renderSourceChips();}
  function render(){
    document.getElementById('diary-subtitle').textContent=config.subtitle||DEFAULT_SUBTITLE;
    document.getElementById('default-author').value=config.defaultName;
    document.getElementById('diary-subtitle-input').value=config.subtitle||DEFAULT_SUBTITLE;
    renderList();
  }
  function renderList(){
    var wrap=document.getElementById('author-list');wrap.replaceChildren();
    options().forEach(function(name){
      var row=document.createElement('div'),label=document.createElement('span'),rename=document.createElement('button'),remove=document.createElement('button');
      row.style.cssText='display:flex;gap:8px;align-items:center;padding:8px 0;';label.style.cssText='flex:1;overflow-wrap:anywhere;';label.textContent=name+(name===config.defaultName?'（默认）':'');
      rename.type=remove.type='button';rename.className=remove.className='filter-btn';rename.textContent='改名';remove.textContent='移除';
      rename.onclick=async function(){
        var answer=prompt('新的记录人名字（仅影响以后新建的记录，历史署名保留）',name);if(answer===null)return;
        try{var updated=validate(answer);if(updated===name)return;await persist({...config,defaultName:config.defaultName===name?updated:config.defaultName,names:Array.from(new Set(config.names.filter(function(n){return n!==name;}).concat(updated))),hidden:Array.from(new Set(config.hidden.filter(function(n){return n!==updated;}).concat(name)))});showToast('名字已更新，旧日记署名保留');}catch(error){showToast(error.message);}
      };
      remove.onclick=async function(){if(name===config.defaultName){showToast('请先更换默认名字，再移除此选项');return;}try{await persist({...config,names:config.names.filter(function(n){return n!==name;}),hidden:Array.from(new Set(config.hidden.concat(name)))});showToast('已移除选项，历史署名保留');}catch(error){showToast('名字设置未保存');}};
      row.append(label,rename,remove);wrap.appendChild(row);
    });
  }
  document.getElementById('authors-toggle').onclick=async function(){renderList();document.getElementById('authors-panel').classList.toggle('open');};
  document.getElementById('authors-toggle').onkeydown=function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();this.click();}};
  document.getElementById('save-authors').onclick=async function(){
    try{var name=validate(document.getElementById('default-author').value),subtitle=document.getElementById('diary-subtitle-input').value.trim();if(subtitle.length>100)throw new Error('顶部说明最多100个字符');
      await persist({...config,defaultName:name,subtitle:subtitle,names:Array.from(new Set(config.names.concat(name))),hidden:config.hidden.filter(function(n){return n!==name;})});showToast('已保存，仅影响当前设备与以后的新记录');
    }catch(error){showToast(error.message);}
  };
  document.getElementById('add-author').onclick=async function(){try{var name=validate(document.getElementById('new-author').value);await persist({...config,names:Array.from(new Set(config.names.concat(name))),hidden:config.hidden.filter(function(n){return n!==name;})});document.getElementById('new-author').value='';}catch(error){showToast(error.message);}};
  var welcome=document.getElementById('author-onboarding');
  document.getElementById('cancel-first-author').onclick=async function(){welcome.close();};
  document.getElementById('confirm-first-author').onclick=async function(){
    try{var name=validate(document.getElementById('first-author').value);await persist({...config,defaultName:name,names:Array.from(new Set(config.names.concat(name))),hidden:config.hidden.filter(function(n){return n!==name;})});welcome.close();openSheet();}
    catch(error){document.getElementById('first-author-error').textContent=error.message;}
  };
  document.getElementById('first-author').onkeydown=function(e){if(e.key==='Enter'){e.preventDefault();document.getElementById('confirm-first-author').click();}};
  window.AuthorSettings={reload:function(){config=DiaryStore.config(KEY,config);render();renderSourceChips();},names:names,options:options,defaultName:function(){return config.defaultName;},begin:function(){document.getElementById('first-author-error').textContent='';document.getElementById('first-author').value='';welcome.showModal();document.getElementById('first-author').focus();},hasUnsaved:function(){return !!document.getElementById('new-author').value.trim()||document.getElementById('default-author').value.trim()!==config.defaultName||document.getElementById('diary-subtitle-input').value.trim()!==(config.subtitle||DEFAULT_SUBTITLE);}};
  render();renderSourceChips();
})();
