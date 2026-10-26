// diary-release: 2026.10.26.10
(function () {
  'use strict';
  var version = document.querySelector('meta[name="diary-version"]').content;
  var base = new URL('./', location.href);
  var hadController = !!navigator.serviceWorker?.controller, approvedDraft = null;
  var registration, waiting, reloadReady = false, applying = false, checking = false;
  var status = document.getElementById('update-status');
  var banner = document.getElementById('update-banner');
  var applyButtons = [document.getElementById('apply-update'), document.getElementById('settings-update-now')];
  document.getElementById('app-version').textContent = '当前版本：' + version;

  // Per-tab session snapshots plus durable drafts; no shared draft is silently overwritten.
  var draftKey;
  try{draftKey=sessionStorage.getItem('diary_tab_id');if(!draftKey){draftKey=crypto.randomUUID();sessionStorage.setItem('diary_tab_id',draftKey);}}catch(_){draftKey=crypto.randomUUID();}
  var draftTimer,storageWarning=false;
  async function persistDraft(){
    if(!hasDiaryDraft())return;
    var value={snapshot:JSON.parse(sheetSnapshot()),base:editingBase,savedAt:Date.now()};
    try{sessionStorage.setItem(DRAFT_KEY,JSON.stringify(value));}catch(_){}
    await DiaryStore.draft(draftKey,value);
  }
  function captureDraft(){clearTimeout(draftTimer);draftTimer=setTimeout(function(){persistDraft().catch(function(){if(!storageWarning){storageWarning=true;showToast('草稿暂存失败，请尽快保存或复制正文');}});},120);}
  ['input','change','click'].forEach(function(type){document.getElementById('sheet').addEventListener(type,captureDraft);});
  window.addEventListener('pagehide',function(){clearTimeout(draftTimer);persistDraft().catch(function(){});});
  window.addEventListener('beforeunload',function(event){if(!hasDiaryDraft())return;try{sessionStorage.setItem(DRAFT_KEY,JSON.stringify({snapshot:JSON.parse(sheetSnapshot()),base:editingBase,savedAt:Date.now()}));}catch(_){event.preventDefault();event.returnValue='';}});
  function restoreDraft(value){
    var saved=value.snapshot||value;
    if(!saved||typeof saved.text!=='string'||typeof saved.date!=='string'||!Array.isArray(saved.tags)||typeof saved.source!=='string')throw new Error('草稿格式不正确');
    var original=saved.id?entries.find(function(e){return e.id===saved.id;}):null;
    openSheet(original||{source:saved.source});
    if(!original){editingId=null;document.getElementById('sheet-title').textContent='新增记录';}
    if(value.base)editingBase=value.base;
    document.getElementById('entry-date').value=saved.date;document.getElementById('entry-text').value=saved.text;
    sheetPhotos=Array.isArray(saved.photos)?saved.photos:[];sheetSelectedTags=saved.tags;sheetExtraTags=saved.tags.slice();
    document.getElementById('entry-links').value=saved.linksText||'';MediaAssets.renderSheet();renderSheetTagChips();
    var select=document.getElementById('entry-source');if(!Array.from(select.options).some(o=>o.value===saved.source)){var option=document.createElement('option');option.value=saved.source;option.textContent=saved.source;select.appendChild(option);}select.value=saved.source;showToast('已恢复未保存的草稿');
  }
  window.DiaryDrafts={clear:async function(){clearTimeout(draftTimer);await DiaryStore.draft(draftKey,null);},restore:restoreDraft,persist:persistDraft};
  try{var own;try{own=JSON.parse(sessionStorage.getItem(DRAFT_KEY)||'null');}catch(_){}if(!own)own=DiaryStore.snapshot.drafts.find(d=>d.key===draftKey)?.value;if(own)restoreDraft(own);}catch(_){showToast('草稿恢复未完成，可在设置中查看');}
  document.getElementById('recover-drafts').onclick=async function(){
    var data=await DiaryStore.dump(),wrap=document.getElementById('draft-list');wrap.replaceChildren();
    for(var draft of data.drafts){(function(item){var value=item.value.snapshot||item.value,row=document.createElement('div'),label=document.createElement('p'),restore=document.createElement('button'),remove=document.createElement('button');label.textContent=(value.date||'未填写日期')+' · '+(value.text||'图片或链接草稿').slice(0,80);restore.className=remove.className='filter-btn';restore.textContent='恢复';remove.textContent='删除草稿';restore.onclick=function(){if(hasDiaryDraft()&&!confirm('当前草稿也会保留，切换恢复所选草稿？'))return;document.getElementById('draft-dialog').close();toggleSettings(false);restoreDraft(item.value);};remove.onclick=async function(){if(confirm('仅删除这份未保存草稿？')){await DiaryStore.draft(item.key,null);row.remove();}};row.append(label,restore,remove);wrap.appendChild(row);})(draft);}
    if(!data.drafts.length)wrap.textContent='没有暂存草稿';document.getElementById('draft-dialog').showModal();
  };
  document.getElementById('close-drafts').onclick=function(){document.getElementById('draft-dialog').close();};

  function announce(message) {
    document.getElementById('update-message').textContent = '新版本已就绪';
    document.getElementById('update-message').title = message;
    document.body.classList.add('has-app-update');
    banner.hidden = false;
    document.getElementById('settings-update-now').hidden = false;
    status.textContent = message;
  }
  document.getElementById('dismiss-update').onclick = function () { banner.hidden = true; document.body.classList.remove('has-app-update'); };
  function watch(worker) {
    if (!worker) return;
    function inspect() {
      if (worker.state === 'installed') {
        if (navigator.serviceWorker.controller) {
          waiting = registration.waiting || worker;
          announce('新版本已下载，点击更新后生效。');
        } else status.textContent = '离线缓存已就绪，断网也可打开日记。';
      }
      if (worker.state === 'redundant') { applying = false; applyButtons.forEach(function (b) { b.disabled = false; }); status.textContent = '新版下载失败，当前版本仍可使用，请稍后检查更新。'; }
    }
    worker.addEventListener('statechange', inspect); inspect();
  }
  async function check(manual) {
    if (checking) return;
    checking = true;
    document.getElementById('check-update').disabled = true;
    try {
      if (!registration) throw new Error('离线功能尚未就绪，请联网刷新后重试');
      var release=await DiaryNet.request(new URL('version.json',base),{},10000);
      if (typeof release.version !== 'string') throw new Error('版本信息格式有误');
      // registration also checks its script during page load; manual checks force a fresh check.
      if (manual || release.version !== version) await registration.update();
      if (registration.waiting) { waiting = registration.waiting; announce('新版本已下载，点击更新后生效。'); }
      else if (reloadReady) announce('新版已就绪，保存编辑后重新打开即可使用。');
      else if (release.version !== version) status.textContent = '发现新版本 ' + release.version + '，正在准备离线文件，请稍候；若未完成可稍后检查更新。';
      else if (navigator.serviceWorker.controller) status.textContent = '已是最新版本 ' + version + '，离线缓存已就绪。';
      else status.textContent = '已是最新版本 ' + version + '，正在准备离线缓存。';
    } catch (error) { status.textContent = navigator.onLine ? '检查未完成：' + error.message : '当前离线，联网后可检查更新。'; }
    finally { checking = false; document.getElementById('check-update').disabled = false; }
  }
  async function safeToUpdate() {
    if (window.AuthorSettings && AuthorSettings.hasUnsaved()) { showToast('有未保存的名字或顶部说明，请先保存再更新'); return false; }
    if (mediaBusy) { showToast('图片处理中，请稍后更新'); return false; }
    if (document.getElementById('sync-dialog').open) { showToast('正在同步，请完成或停止后再更新'); return false; }
    // Do not silently throw away settings the user has typed.
    var settingsFields = ['sync-url','bg-url','bg-scrim-input','card-opacity-input'];
    var storedFields = ['syncUrl','bgUrl','scrim','cardOpacity'];
    var unsavedSecret = false;var secretInputRemembered=await DiaryStore.secret();
    try { unsavedSecret = document.getElementById('sync-secret').value !== (sessionStorage.getItem('diary_sync_secret') || secretInputRemembered || ''); } catch (_) {}
    if (unsavedSecret || document.getElementById('remember-secret').checked!==!!secretInputRemembered || settingsFields.some(function (id, i) {
      var fallback = i === 2 ? 72 : i === 3 ? 62 : '';
      var input = document.getElementById(id).value.trim();
      if (id === 'sync-url') input = input.replace(/\/$/, '');
      return input !== String(appSettings[storedFields[i]] === undefined ? fallback : appSettings[storedFields[i]]);
    })) { showToast('有未保存的设置，请先保存再更新'); return false; }
    if (hasDiaryDraft()) {
      if (!confirm('有未保存的日记。草稿会暂存在本机，并在更新后恢复。现在更新？')) return false;
      try { await persistDraft(); } catch (_) { showToast('草稿暂存失败，请先保存日记再更新'); return false; }
    }
    return true;
  }
  async function apply() {
    if (!await safeToUpdate()) return;
    if (reloadReady) { location.reload(); return; }
    waiting = registration && registration.waiting;
    if (!waiting) { status.textContent = '新版尚未下载完成，请稍后检查更新'; return; }
    approvedDraft = hasDiaryDraft() ? sheetSnapshot() : null;
    applying = true;
    applyButtons.forEach(function (button) { button.disabled = true; });
    status.textContent = '正在切换新版…';
    waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
  }
  applyButtons.forEach(function (button) { button.onclick = apply; });
  document.getElementById('check-update').onclick = function () { return check(true); };
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    status.textContent = '此浏览器或网址不支持离线更新，请使用HTTPS网址。'; return;
  }
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!navigator.serviceWorker.controller) return;
    if (!hadController && !applying) { hadController = true; status.textContent = '离线缓存已就绪，断网也可打开日记。'; return; }
    hadController = true;
    // Other open tabs may be editing. They must never be forcibly reloaded.
    if (applying && (!hasDiaryDraft() || sheetSnapshot() === approvedDraft) && !document.getElementById('sync-dialog').open) { location.reload(); return; }
    reloadReady = true; applying = false;
    applyButtons.forEach(function (button) { button.disabled = false; });
    if (navigator.serviceWorker.controller.scriptURL) announce('离线版本已就绪；可在方便时重新打开。');
  });
  navigator.serviceWorker.register(new URL('sw.js', base), { scope: base.href, updateViaCache: 'none' }).then(function (value) {
    registration = value;
    if (registration.waiting) { waiting = registration.waiting; announce('新版本已下载，点击更新后生效。'); }
    watch(registration.installing);
    registration.addEventListener('updatefound', function () { watch(registration.installing); });
    return check(false);
  }).catch(function () { status.textContent = '离线缓存未就绪，请联网后重新打开或检查更新。'; });
})();
