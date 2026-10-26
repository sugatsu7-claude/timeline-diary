// diary-release: 2026.10.26.5
/* Notion sync is invoked ONLY by the sync button. No timers or lifecycle listeners. */
(function () {
  'use strict';
  var running = false, stop = false;
  var secretInput = document.getElementById('sync-secret');
  try { secretInput.value = sessionStorage.getItem('diary_sync_secret') || ''; } catch (_) {}
  function signature(entry) {
    if (!entry) return '__DELETED__';
    var fields=[entry.date,entry.text,sourceName(entry.source),(entry.tags||[]).slice().sort()];
    if((entry.photos||[]).length||(entry.links||[]).length)fields.push((entry.photos||[]).map(function(p){return [p.id,p.revision||''];}),entry.links||[]);
    return JSON.stringify(fields);
  }
  function remoteEntry(value) {
    if (typeof value.id !== 'string' || typeof value.text !== 'string' || !Array.isArray(value.tags)) throw new Error('同步服务返回无效日记');
    return { id: value.id, date: value.date, text: value.text, tags: value.tags,
      photos: (value.photos || []).map(function(photo){var old=entries.flatMap(function(e){return e.photos||[];}).find(function(p){return p.id===photo.id;});return {...old,...photo,localRevision:old ? (old.localRevision || old.revision || photo.revision) : undefined,pageId:value.pageId};}), links:value.links||[],
      source: sourceName(value.source), createdAt: value.createdAt || Date.now(),
      readOnly: !!value.readOnly, notionUrl: /^https:\/\/(www\.)?notion\.so\//.test(value.url || '') ? value.url : undefined };
  }
  document.getElementById('cancel-sync').onclick = function () { stop = true; };
  async function runSync(fullRequested) {
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
    document.getElementById('full-sync-btn').disabled = true;
    var dialog = document.getElementById('sync-dialog');
    dialog.showModal();
    dialog.oncancel = function (e) { e.preventDefault(); stop = true; };
    var counter = { up: 0, down: 0, conflict: 0, missing: 0, reads: 0, writes: 0, catalogs: 0, images: 0 };
    function precisionCheckDue(base, version) {
      var stamp=Date.parse(version);
      return !!base && Number.isFinite(stamp) && (!base.checkedAt || base.checkedAt < stamp+120000) && (fullRequested || Date.now() >= stamp+120000);
    }
    var state, key;
    async function call(path, body) {
      if (stop) throw new Error('已停止；已完成的操作已保留，可再次同步');
      // At most 2 Worker requests/second; Worker also paces Notion subrequests.
      await new Promise(function (resolve) { setTimeout(resolve, 500); });
      if (stop) throw new Error('已停止；已完成的操作已保留，可再次同步');
      var progress=document.getElementById('sync-progress');
      if(path==='/catalog'){counter.catalogs++;progress.textContent='检查Notion变更 · 第'+counter.catalogs+'页';}
      else if(path==='/read'){counter.reads++;progress.textContent='核验记录内容 · 本次读取'+counter.reads+'条';}
      else if(path==='/write'){counter.writes++;progress.textContent='保存修改 · 本次提交'+counter.writes+'条';}
      else if(path==='/upload'||path==='/copy-upload'){counter.images++;progress.textContent='准备日记图片 · '+counter.images+'张';}
      var response = await fetch(endpoint.origin + path, { method: 'POST', cache: 'no-store',
        headers: { ...(body instanceof FormData ? {} : {'Content-Type':'application/json'}), Authorization: 'Bearer ' + secretInput.value },
        body: body instanceof FormData ? body : JSON.stringify(body) });
      var data;
      try { data = await response.json(); } catch (_) { throw new Error('服务返回格式有误，请确认已部署新版Worker'); }
      if (!response.ok) { var error = new Error(data.error || '同步失败：' + response.status); error.status = response.status; throw error; }
      return data;
    }
    async function write(body) {
      body.entry = await MediaAssets.prepare(body.entry,body.pageId,call,endpoint.origin,body.deleted);
      return call('/write',body);
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
    async function mergeRemote(id, value, local, base) {
      if (value.id !== id) throw new Error('Notion日记ID已改变，请恢复原ID后重试，或执行完整核对');
      var incoming = value.deleted ? undefined : remoteEntry(value);
      var incomingSig = signature(incoming);
      var localChanged = base ? base.signature !== signature(local) : !!local;
      if (localChanged && signature(local) !== incomingSig) {
        if (local) {
          var copy = { ...local, id: uid(), readOnly: false, tags: Array.from(new Set((local.tags || []).concat(['同步冲突']))) };
          delete copy.notionUrl;
          entries.push(copy);
        }
        counter.conflict++;
      }
      if (!incoming && local) { trash.push({ ...local, deletedAt: Date.now() }); saveTrash(); }
      var changed=signature(local)!==incomingSig;
      commit(id, value, incoming); if(changed)counter.down++;
    }
    async function writeExisting(id, payload, base, local) {
      try {
        var result = await write( { pageId: base.pageId, baseVersion: base.version, baseSignature: base.signature,
          entry: { ...payload, source: sourceName(payload.source) }, deleted: !local });
        commit(id, result, result.deleted ? undefined : remoteEntry(result)); counter.up++;
      } catch (error) {
        if (error.status !== 409) throw error;
        // A remote edit outside the delta window is still caught by write preflight.
        var current = await call('/read', { pageId: base.pageId });
        if (current.readOnly) throw error;
        await mergeRemote(id, current, local, base);
      }
    }
    try {
      var prefix = 'diary_sync_v1:' + endpoint.origin + ':';
      var targetKey = 'diary_sync_target_v2:' + endpoint.origin;
      var knownDatabase = localStorage.getItem(targetKey);
      if (!knownDatabase) {
        // Reuse the existing v1 baseline. Ambiguous database switches force a full discovery.
        var candidates = [];
        for (var storageIndex = 0; storageIndex < localStorage.length; storageIndex++) {
          var storedKey = localStorage.key(storageIndex);
          if (storedKey && storedKey.indexOf(prefix) === 0) candidates.push(storedKey.slice(prefix.length));
        }
        if (candidates.length === 1) knownDatabase = candidates[0];
      }
      function loadState(databaseId) {
        var saved = JSON.parse(localStorage.getItem(prefix + databaseId) || '{"items":{}}');
        if (!saved.items || typeof saved.items !== 'object' || Array.isArray(saved.items)) throw new Error('同步状态异常，请导出本机备份');
        saved.items = Object.assign(Object.create(null), saved.items);
        return saved;
      }
      state = knownDatabase ? loadState(knownDatabase) : { items: Object.create(null) };
      // v1 lastSync was taken at the END, so it is not a safe incremental watermark.
      // One full catalog on upgrade establishes a server-side start watermark without reuploading old entries.
      var incremental = !fullRequested && state.mediaVersion === 1 && state.watermark && Number.isFinite(Date.parse(state.watermark));
      var since = incremental ? new Date(Date.parse(state.watermark) - 120000).toISOString() : null;
      var catalog = [], cursor, database, syncStartedAt;
      do {
        document.getElementById('sync-progress').textContent = incremental ? '检查Notion新增与修改…' : '完整核对Notion日记目录…';
        var batch = await call('/catalog', { cursor: cursor, since: since });
        if (batch.protocol !== 2 || batch.media !== 1 || !Array.isArray(batch.entries) || !batch.database || !Number.isFinite(Date.parse(batch.syncStartedAt)) || batch.since !== since) throw new Error('请先部署图片附件版Worker，再更新PWA');
        if (database && database !== batch.database) throw new Error('同步期间数据库配置发生变化，请重试');
        if (knownDatabase && knownDatabase !== batch.database && incremental) {
          // Never apply an old database watermark to a new database.
          incremental = false; since = null; catalog = []; cursor = null;
          knownDatabase = null; database = null; syncStartedAt = null;
          continue;
        }
        database = batch.database;
        if (!syncStartedAt) syncStartedAt = batch.syncStartedAt;
        catalog = catalog.concat(batch.entries);
        cursor = batch.hasMore ? batch.cursor : null;
        if (batch.hasMore && !cursor) throw new Error('无效分页游标');
      } while (cursor || !database);
      key = prefix + database;
      state = loadState(database);
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
      var localById = new Map(entries.map(function (entry) { return [entry.id, entry]; }));
      var candidates = new Set(remote.keys());
      if (!incremental) {
        entries.forEach(function (entry) { candidates.add(entry.id); });
        Object.keys(state.items).forEach(function (id) { candidates.add(id); });
      } else {
        // Compute the pending set entirely on this device; scanning local data costs no requests.
        var localIds = new Set(Array.from(localById.keys()).concat(Object.keys(state.items)));
        localIds.forEach(function (id) {
          var base = state.items[id], local = localById.get(id);
          var stamp = base ? Date.parse(base.version) : NaN;
          var unsettled = precisionCheckDue(base, base && base.version);
          if (!base || base.signature !== signature(local) || unsettled) candidates.add(id);
        });
      }
      var ids = Array.from(candidates);
      for (var i = 0; i < ids.length; i++) {
        if (stop) throw new Error('已停止；已完成的操作已保留，可再次同步');
        var id = ids[i], meta = remote.get(id), base = state.items[id];
        var local = localById.get(id);
        var localSig = signature(local);
        if (!meta && base && incremental) {
          // Absence from a delta means unchanged, not deleted. Writes still verify current Notion content.
          meta = { pageId: base.pageId, version: base.version };
        }
        if (!meta) {
          if (base) { if (local) counter.missing++; continue; } // Never resurrect pages trashed in Notion.
          if (!local) continue;
          var created;
          try { created = await write( { entry: { ...local, source: sourceName(local.source) } }); }
          catch (error) { if (error.status === 409) throw new Error('新记录的日记ID与Notion已有内容冲突，请在设置执行完整核对'); throw error; }
          commit(id, created, remoteEntry(created)); counter.up++;
          continue;
        }
        var localChanged = base ? base.signature !== localSig : !!local;
        // Notion timestamps can be rounded; recheck an unsettled timestamp once outside a two-minute window.
        var stamp = Date.parse(meta.version);
        var unsettled = precisionCheckDue(base, meta.version);
        var remoteChanged = !base || base.version !== meta.version || unsettled || (state.mediaVersion !== 1 && local && local.readOnly);
        if (!localChanged && !remoteChanged) continue;
        if (remoteChanged) {
          var value = await call('/read', { pageId: meta.pageId });
          var incoming = value.deleted ? undefined : remoteEntry(value);
          var incomingSig = signature(incoming);
          if (base && localChanged && incomingSig === base.signature) {
            var uploadPayload = local || { id:id,date:value.date,text:value.text,source:value.source,tags:value.tags,photos:value.photos||[],links:value.links||[] };
            var uploaded = await write( { pageId: base.pageId, baseVersion: value.version, baseSignature: incomingSig,
              entry: { ...uploadPayload, source: sourceName(uploadPayload.source) }, deleted: !local });
            commit(id, uploaded, uploaded.deleted ? undefined : remoteEntry(uploaded)); counter.up++;
            continue;
          }
          await mergeRemote(id, value, local, base);
          continue;
        }
        if (localChanged) {
          // Missing local record means explicit deletion after a previously synced baseline.
          var payload = local || JSON.parse(base.signature).reduce(function (entry, field, index) {
            if(index<4)entry[['date','text','source','tags'][index]]=field;else if(index===4)entry.photos=field.map(function(p){return Array.isArray(p)?{id:p[0],revision:p[1]}:{id:p};});else if(index===5)entry.links=field;return entry;
          }, { id: id });
          await writeExisting(id, payload, base, local);
        }
      }
      if (stop) throw new Error('已停止；同步时间点未推进，可再次同步');
      // Only a completely successful run advances the watermark; use START, not completion time.
      state.mediaVersion = 1;
      state.watermark = syncStartedAt;
      state.lastSync = new Date().toISOString();
      localStorage.setItem(key, JSON.stringify(state));
      localStorage.setItem(targetKey, database);
      document.getElementById('sync-status').textContent = (incremental ? '增量同步：' : '完整核对：') + new Date(state.lastSync).toLocaleString() + '；上传' + counter.up + '条，更新本机' + counter.down + '条；读取正文' + counter.reads + '条，查询目录' + counter.catalogs + '页。' +
        (counter.conflict ? '冲突' + counter.conflict + '条：本机内容已另存副本，下次同步上传。' : '') +
        (counter.missing ? counter.missing + '条在Notion已移除，未自动重建；请先在Notion恢复。' : '');
      showToast(counter.conflict || counter.missing ? '同步完成，请查看设置里的冲突或移除提示' : '同步完成');
    } catch (error) {
      document.getElementById('sync-status').textContent = '同步未完成：' + error.message + '。请保留本机备份。';
      showToast('同步未完成，请查看设置中的提示');
    } finally {
      running = false; button.disabled = false; document.getElementById('full-sync-btn').disabled = false; dialog.close();
      renderTimeline(); renderTagChips(); renderSourceChips();
    }
  }
  document.getElementById('sync-btn').onclick = function () { return runSync(false); };
  document.getElementById('full-sync-btn').onclick = function () { return runSync(true); };
})();
