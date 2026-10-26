// diary-release: 2026.10.26.7
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

  // Drafts live in device storage, never in the service worker cache or Notion automatically.
  function persistDraft() {
    if (hasDiaryDraft()) {
      var snapshot = sheetSnapshot();
      try { sessionStorage.setItem(DRAFT_KEY, snapshot); } catch (_) {}
      localStorage.setItem(DRAFT_KEY, snapshot);
    }
  }
  var storageWarning = false;
  function captureDraft() {
    try { persistDraft(); }
    catch (_) { if (!storageWarning) { storageWarning = true; showToast('草稿暂存失败，请尽快保存或复制正文'); } }
  }
  ['input', 'change', 'click'].forEach(function (event) {
    document.getElementById('sheet').addEventListener(event, function () { queueMicrotask(captureDraft); });
  });
  window.addEventListener('pagehide', captureDraft);
  window.addEventListener('beforeunload', function (event) {
    if (!hasDiaryDraft()) return;
    try { persistDraft(); } catch (_) { event.preventDefault(); event.returnValue = ''; }
  });
  try {
    var ownDraft;
    try { ownDraft = sessionStorage.getItem(DRAFT_KEY); } catch (_) {}
    var saved = JSON.parse(ownDraft || localStorage.getItem(DRAFT_KEY) || 'null');
    if (saved && typeof saved.text === 'string' && typeof saved.date === 'string' && Array.isArray(saved.tags) && saved.tags.every(function (tag) { return typeof tag === 'string'; }) && typeof saved.source === 'string') {
      var original = saved.id ? entries.find(function (entry) { return entry.id === saved.id; }) : null;
      openSheet(original || {source: saved.source});
      if (!original) { editingId = null; document.getElementById('sheet-title').textContent = '新增记录'; }
      document.getElementById('entry-date').value = saved.date;
      document.getElementById('entry-text').value = saved.text;
      sheetPhotos = Array.isArray(saved.photos) ? saved.photos : [];
      document.getElementById('entry-links').value = saved.linksText || '';
      if (window.MediaAssets) MediaAssets.renderSheet();
      sheetSelectedTags = saved.tags;
      renderSheetTagChips();
      if (didMigrateLegacySources) saved.source = legacySourceName(saved.source);
      var select = document.getElementById('entry-source');
      if (!Array.from(select.options).some(function (option) { return option.value === saved.source; })) {
        var option = document.createElement('option'); option.value = saved.source; option.textContent = saved.source; select.appendChild(option);
      }
      select.value = saved.source;
      showToast('已恢复未保存的草稿');
    }
  } catch (_) { status.textContent = '草稿恢复失败，请保留本机数据'; }

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
      var controller = new AbortController();
      var timeout = setTimeout(function () { controller.abort(); }, 10000);
      var response;
      try { response = await fetch(new URL('version.json', base), { cache: 'no-store', signal: controller.signal }); }
      finally { clearTimeout(timeout); }
      if (!response.ok) throw new Error('无法读取版本信息');
      var release = await response.json();
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
  function safeToUpdate() {
    if (window.AuthorSettings && AuthorSettings.hasUnsaved()) { showToast('有未保存的名字或顶部说明，请先保存再更新'); return false; }
    if (mediaBusy) { showToast('图片处理中，请稍后更新'); return false; }
    if (document.getElementById('sync-dialog').open) { showToast('正在同步，请完成或停止后再更新'); return false; }
    // Do not silently throw away settings the user has typed.
    var settingsFields = ['sync-url','bg-url','bg-scrim-input','card-opacity-input'];
    var storedFields = ['syncUrl','bgUrl','scrim','cardOpacity'];
    var unsavedSecret = false;
    try { unsavedSecret = document.getElementById('sync-secret').value !== (sessionStorage.getItem('diary_sync_secret') || ''); } catch (_) {}
    if (unsavedSecret || settingsFields.some(function (id, i) {
      var fallback = i === 2 ? 72 : i === 3 ? 62 : '';
      var input = document.getElementById(id).value.trim();
      if (id === 'sync-url') input = input.replace(/\/$/, '');
      return input !== String(appSettings[storedFields[i]] === undefined ? fallback : appSettings[storedFields[i]]);
    })) { showToast('有未保存的设置，请先保存再更新'); return false; }
    if (hasDiaryDraft()) {
      if (!confirm('有未保存的日记。草稿会暂存在本机，并在更新后恢复。现在更新？')) return false;
      try { persistDraft(); } catch (_) { showToast('草稿暂存失败，请先保存日记再更新'); return false; }
    }
    return true;
  }
  function apply() {
    if (!safeToUpdate()) return;
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
