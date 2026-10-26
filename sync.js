/* Notion sync is invoked ONLY by the sync button. No timers or lifecycle listeners. */
(function () {
  'use strict';
  var running = false, stop = false;
  var secretInput = document.getElementById('sync-secret');
  try { secretInput.value = sessionStorage.getItem('diary_sync_secret') || ''; } catch (_) {}
  function signature(entry) {
    if (!entry) return '__DELETED__';
    return JSON.stringify([entry.date, entry.text, sourceName(entry.source), (entry.tags || []).slice().sort()]);
  }
  function remoteEntry(value) {
    if (typeof value.id !== 'string' || typeof value.text !== 'string' || !Array.isArray(value.tags)) throw new Error('同步服务返回无效日记');
    return { id: value.id, date: value.date, text: value.text, tags: value.tags,
      source: sourceName(value.source), createdAt: value.createdAt || Date.now(),
      readOnly: !!value.readOnly, notionUrl: /^https:\/\/(www\.)?notion\.so\//.test(value.url || '') ? value.url : undefined };
  }
  document.getElementById('cancel-sync').onclick = function () { stop = true; };
  document.getElementById('sync-btn').onclick = async function () {
    if (running) return;
    if (!appSettings.syncUrl || !secretInput.value) {
      toggleSettings(true);
      document.getElementById('settings-panel').classList.add('open');
      showToast('请先填写服务地址和同步口令，再保存设置');
      return;
    }
    var endpoint;
    try {
      endpoint = new URL(appSettings.syncUrl);
      if (endpoint.protocol !== 'https:' || endpoint.pathname !== '/' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw Error();
    } catch (_) { showToast('请填写HTTPS服务根地址'); return; }
    running = true; stop = false;
    var button = document.getElementById('sync-btn');
    button.disabled = true;
    var dialog = document.getElementById('sync-dialog');
    dialog.showModal();
    dialog.oncancel = function (e) { e.preventDefault(); stop = true; };
    var counter = { up: 0, down: 0, conflict: 0, missing: 0 };
    var state, key;
    async function call(path, body) {
      if (stop) throw new Error('已停止；已完成的操作已保留，可再次同步');
      // At most 2 Worker requests/second; Worker also paces Notion subrequests.
      await new Promise(function (resolve) { setTimeout(resolve, 500); });
      if (stop) throw new Error('已停止；已完成的操作已保留，可再次同步');
      var response = await fetch(endpoint.origin + path, { method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + secretInput.value },
        body: JSON.stringify(body) });
      var data;
      try { data = await response.json(); } catch (_) { throw new Error('服务返回格式有误，请确认已部署新版Worker'); }
      if (!response.ok) throw new Error(data.error || '同步失败：' + response.status);
      return data;
    }
    function commit(id, value, entry) {
      // Persist data before its baseline. If quota fails, old baseline is retained.
      var next = entries.filter(function (item) { return item.id !== id; });
      if (entry) next.push(entry);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      entries = next;
      state.items[id] = { pageId: value.pageId, version: value.version, checkedAt: Date.now(), signature: signature(entry) };
      localStorage.setItem(key, JSON.stringify(state));
    }
    try {
      var catalog = [], cursor;
      var database;
      do {
        document.getElementById('sync-progress').textContent = '检查Notion日记目录…';
        var batch = await call('/catalog', { cursor: cursor });
        if (!Array.isArray(batch.entries) || !batch.database) throw new Error('Worker协议不匹配');
        if (database && database !== batch.database) throw new Error('同步期间数据库配置发生变化，请重试');
        database = batch.database;
        catalog = catalog.concat(batch.entries);
        cursor = batch.hasMore ? batch.cursor : null;
        if (batch.hasMore && !cursor) throw new Error('无效分页游标');
      } while (cursor);
      key = 'diary_sync_v1:' + endpoint.origin + ':' + database;
      state = JSON.parse(localStorage.getItem(key) || '{"items":{}}');
      if (!state.items || typeof state.items !== 'object' || Array.isArray(state.items)) throw new Error('同步状态异常，请导出本机备份');
      state.items = Object.assign(Object.create(null), state.items);
      if (!state.confirmed) {
        if (!confirm('首次连接这个Notion数据库：会上传本机日记，并下载Notion日记。请确认这是你自己的服务且已导出备份。继续？')) throw new Error('已取消首次同步');
        state.confirmed = true;
        localStorage.setItem(key, JSON.stringify(state));
      }
      var remote = new Map();
      catalog.forEach(function (item) {
        if (remote.has(item.id)) throw new Error('Notion中日记ID重复，请先整理，未执行数据同步');
        remote.set(item.id, item);
      });
      var ids = Array.from(new Set(entries.map(function (e) { return e.id; }).concat(Array.from(remote.keys()), Object.keys(state.items))));
      for (var i = 0; i < ids.length; i++) {
        if (stop) throw new Error('已停止；已完成的操作已保留，可再次同步');
        var id = ids[i], meta = remote.get(id), base = state.items[id];
        var local = entries.find(function (entry) { return entry.id === id; });
        var localSig = signature(local);
        document.getElementById('sync-progress').textContent = '同步日记 ' + (i + 1) + '/' + ids.length + '…';
        if (!meta) {
          if (base) { if (local) counter.missing++; continue; } // Never resurrect pages trashed in Notion.
          if (!local) continue;
          var created = await call('/write', { entry: { ...local, source: sourceName(local.source) } });
          commit(id, created, remoteEntry(created)); counter.up++;
          continue;
        }
        var localChanged = base ? base.signature !== localSig : !!local;
        // Notion timestamps can be rounded; recheck an unsettled timestamp once outside a two-minute window.
        var stamp = Date.parse(meta.version);
        var unsettled = Number.isFinite(stamp) && (!base || !base.checkedAt || base.checkedAt < stamp + 120000);
        var remoteChanged = !base || base.version !== meta.version || unsettled;
        if (!localChanged && !remoteChanged) continue;
        if (remoteChanged) {
          var value = await call('/read', { pageId: meta.pageId });
          var incoming = value.deleted ? undefined : remoteEntry(value);
          var incomingSig = signature(incoming);
          if (base && localChanged && incomingSig === base.signature) {
            var uploadPayload = local || { id: id, date: value.date, text: value.text, source: value.source, tags: value.tags };
            var uploaded = await call('/write', { pageId: base.pageId, baseVersion: value.version, baseSignature: incomingSig,
              entry: { ...uploadPayload, source: sourceName(uploadPayload.source) }, deleted: !local });
            commit(id, uploaded, uploaded.deleted ? undefined : remoteEntry(uploaded)); counter.up++;
            continue;
          }
          if (localChanged && localSig !== incomingSig) {
            // Preserve both, keeping original remote page as canonical. No forced overwrite.
            if (local) {
              var copy = { ...local, id: uid(), readOnly: false, tags: Array.from(new Set((local.tags || []).concat(['同步冲突']))) };
              delete copy.notionUrl;
              entries.push(copy);
            }
            counter.conflict++;
          }
          if (!incoming && local) {
            trash.push({ ...local, deletedAt: Date.now() }); saveTrash();
          }
          commit(id, value, incoming); counter.down++;
          continue;
        }
        if (localChanged) {
          // Missing local record means explicit deletion after a previously synced baseline.
          var payload = local || JSON.parse(base.signature).reduce(function (entry, field, index) {
            entry[['date', 'text', 'source', 'tags'][index]] = field; return entry;
          }, { id: id });
          var result = await call('/write', { pageId: base.pageId, baseVersion: base.version, baseSignature: base.signature,
            entry: { ...payload, source: sourceName(payload.source) }, deleted: !local });
          commit(id, result, result.deleted ? undefined : remoteEntry(result)); counter.up++;
        }
      }
      state.lastSync = new Date().toISOString();
      localStorage.setItem(key, JSON.stringify(state));
      document.getElementById('sync-status').textContent = '上次同步：' + new Date(state.lastSync).toLocaleString() + '；上传' + counter.up + '条，下载' + counter.down + '条。' +
        (counter.conflict ? '冲突' + counter.conflict + '条：本机内容已另存副本，下次同步上传。' : '') +
        (counter.missing ? counter.missing + '条在Notion已移除，未自动重建；请先在Notion恢复。' : '');
      showToast(counter.conflict || counter.missing ? '同步完成，请查看设置里的冲突或移除提示' : '同步完成');
    } catch (error) {
      document.getElementById('sync-status').textContent = '同步未完成：' + error.message + '。请保留本机备份。';
      showToast('同步未完成，请查看设置中的提示');
    } finally {
      running = false; button.disabled = false; dialog.close();
      renderTimeline(); renderTagChips(); renderSourceChips();
    }
  };
})();
