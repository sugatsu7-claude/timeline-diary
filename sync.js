// diary-release: 2026.10.26.9
/* Notion sync is invoked ONLY by the sync button. No timers or lifecycle listeners. */
window.syncReady=(async function () {
  'use strict';
  var running = false, stop = false;
  var photoIndex=new Map();
  var secretInput = document.getElementById('sync-secret');
  var remembered=await DiaryStore.secret();
  try { secretInput.value = sessionStorage.getItem('diary_sync_secret') || remembered; } catch (_) {secretInput.value=remembered;}
  document.getElementById('remember-secret').checked=!!remembered;
  function signature(entry) {
    if (!entry) return '__DELETED__';
    var fields=[entry.date,entry.text,sourceName(entry.source),(entry.tags||[]).slice().sort()];
    if((entry.photos||[]).length||(entry.links||[]).length)fields.push((entry.photos||[]).map(function(p){return [p.id,p.revision||''];}),entry.links||[]);
    return JSON.stringify(fields);
  }
  function remoteEntry(value,trustUploaded) {
    if (typeof value.id !== 'string' || typeof value.text !== 'string' || !Array.isArray(value.tags)) throw new Error('同步服务返回无效日记');
    return { id: value.id, date: value.date, text: value.text, tags: value.tags,
      photos: (value.photos || []).map(function(photo){var old=photoIndex.get(value.id+':'+photo.id);return {...old,...photo,localRevision:old ? (old.localRevision || old.revision || (trustUploaded?photo.revision:'unknown')) : undefined,pageId:value.pageId};}), links:value.links||[],
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
    return DiaryStore.exclusive('sync:'+endpoint.origin,async function(){
    await refreshDiaryData(false);
    photoIndex=new Map();for(const e of entries)for(const p of e.photos||[])photoIndex.set(e.id+':'+p.id,p);
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
      var data=await DiaryNet.request(endpoint.origin+path,{method:'POST',headers:{...(body instanceof FormData?{}:{'Content-Type':'application/json'}),Authorization:'Bearer '+secretInput.value},body:body instanceof FormData?body:JSON.stringify(body)},path==='/upload'||path==='/copy-upload'?120000:45000);
      return data;
    }
    var activeOperation;
    async function write(body) {
      body.entry=await MediaAssets.prepare(body.entry,body.pageId,call,endpoint.origin,body.deleted);
      var existing=(await DiaryStore.operation()).find(o=>o.status==='pending'&&o.scope===key&&o.entryId===body.entry.id);
      activeOperation=existing||{key:crypto.randomUUID(),scope:key,entryId:body.entry.id,payload:body,localHash:await DiaryStore.digest(signature(entries.find(e=>e.id===body.entry.id))),status:'pending',at:Date.now()};
      body.operationId=activeOperation.key;activeOperation.payload=body;await DiaryStore.operation(activeOperation);
      return call('/write',body);
    }
    async function commit(id,value,entry,expected,extras,keepLocal){
      var base=await DiaryStore.syncCommit(key,id,value,entry,expected,{operation:activeOperation,keepLocal:!!keepLocal},extras||[]);state.items[id]=base;activeOperation=null;
      await refreshDiaryData(false);
      for(const p of entry?.photos||[])photoIndex.set(id+':'+p.id,p);
    }
    async function mergeRemote(id, value, local, base) {
      if (value.id !== id) throw new Error('Notion日记ID已改变，请恢复原ID后重试，或执行完整核对');
      var incoming = value.deleted ? undefined : remoteEntry(value);
      var incomingSig = await DiaryStore.digest(signature(incoming));
      var extras=[];
      var localChanged = base ? base.hash !== await DiaryStore.digest(signature(local)) : !!local;
      if (localChanged && await DiaryStore.digest(signature(local)) !== incomingSig) {
        if (local) {
          var copy = { ...local, id: uid(), readOnly: false, tags: Array.from(new Set((local.tags || []).concat(['同步冲突']))) };
          delete copy.notionUrl;
          extras.push(copy);
        }
        counter.conflict++;
      }
      var changed=await DiaryStore.digest(signature(local))!==incomingSig;
      await commit(id,value,incoming,local,extras); if(changed)counter.down++;
    }
    async function writeExisting(id, payload, base, local) {
      try {
        var result = await write( { pageId: base.pageId, baseVersion: base.version, baseHash: base.hash,
          entry: { ...payload, source: sourceName(payload.source) }, deleted: !local });
        await commit(id,result,result.deleted?undefined:remoteEntry(result,true),local); counter.up++;
      } catch (error) {
        if (error.status !== 409) throw error;
        // A remote edit outside the delta window is still caught by write preflight.
        var current = await call('/read', { pageId: base.pageId });
        if (current.pendingOperation) throw error;
        await mergeRemote(id, current, local, base);
      }
    }
    try {
      var prefix='diary_sync_v1:'+endpoint.origin+':';
      var targetKey='syncTarget:'+endpoint.origin;
      var knownDatabase=DiaryStore.config(targetKey,null);
      if(!knownDatabase){var candidates=Object.keys(DiaryStore.snapshot.scopes).filter(k=>k.startsWith(prefix));if(candidates.length===1)knownDatabase=candidates[0].slice(prefix.length);}
      key=knownDatabase?prefix+knownDatabase:null;
      state=knownDatabase?await DiaryStore.readSync(key):{items:{}};
      // v1 lastSync was taken at the END, so it is not a safe incremental watermark.
      // One full catalog on upgrade establishes a server-side start watermark without reuploading old entries.
      var incremental = !fullRequested && state.mediaVersion === 1 && state.watermark && Number.isFinite(Date.parse(state.watermark));
      var since = incremental ? new Date(Date.parse(state.watermark) - 120000).toISOString() : null;
      var catalog = [], cursor, database, syncStartedAt;
      do {
        document.getElementById('sync-progress').textContent = incremental ? '检查Notion新增与修改…' : '完整核对Notion日记目录…';
        var batch = await call('/catalog', { cursor: cursor, since: since });
        if (batch.protocol !== 2 || batch.media !== 1 || batch.reliability !== 1 || !Array.isArray(batch.entries) || !batch.database || !Number.isFinite(Date.parse(batch.syncStartedAt)) || batch.since !== since) throw new Error('请先部署可靠性升级版Worker，再更新PWA');
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
      state = await DiaryStore.readSync(key);
      if (!state.confirmed) {
        if (!confirm('首次连接这个Notion数据库：会上传本机日记，并下载Notion日记。请确认这是你自己的服务且已导出备份。继续？')) throw new Error('已取消首次同步');
        state.confirmed = true;
        await DiaryStore.saveScope(key,state);
      }
      var recoveredCatalog=[];
      var pending=(await DiaryStore.operation()).filter(o=>o.status==='pending'&&o.scope===key);
      for(var op of pending){
        var current=entries.find(e=>e.id===op.entryId),sameLocal=await DiaryStore.digest(signature(current))===op.localHash;
        activeOperation=op;
        op.payload.entry=await MediaAssets.prepare(op.payload.entry,op.payload.pageId,call,endpoint.origin,op.payload.deleted);
        var recovered;
        try{recovered=await call('/write',{...op.payload,operationId:op.key});}catch(error){if(error.status===409&&error.response?.pageId){var incoming=await call('/read',{pageId:error.response.pageId});if(incoming.pendingOperation)throw error;await mergeRemote(op.entryId,incoming,current,state.items[op.entryId]);recoveredCatalog.push(incoming);continue;}throw error;}
        recoveredCatalog.push(recovered);
        await commit(op.entryId,recovered,recovered.deleted?undefined:remoteEntry(recovered,false),current,[],!sameLocal);
      }
      var remote = new Map();
      var recoveredIds=new Set(pending.map(o=>o.entryId));
      catalog.forEach(function (item) {
        if(recoveredIds.has(item.id))return;
        if (remote.has(item.id)) throw new Error('Notion中日记ID重复，请先整理，未执行数据同步');
        remote.set(item.id, item);
      });
      recoveredCatalog.forEach(item=>remote.set(item.id,item));
      var initialHashes={...DiaryStore.snapshot.hashes};
      var localById = new Map(entries.map(function (entry) { return [entry.id, entry]; }));
      var candidates = new Set(remote.keys());
      if (!incremental) {
        entries.forEach(function (entry) { candidates.add(entry.id); });
        Object.keys(state.items).forEach(function (id) { candidates.add(id); });
      } else {
        // Compute the pending set entirely on this device; scanning local data costs no requests.
        var localIds = new Set(Array.from(localById.keys()).concat(Object.keys(state.items)));
        for(var id of localIds){
          var base = state.items[id], local = localById.get(id);
          var stamp = base ? Date.parse(base.version) : NaN;
          var unsettled = precisionCheckDue(base, base && base.version);
          if (!base || base.hash !== (local?initialHashes[id]:await DiaryStore.digest('__DELETED__')) || unsettled) candidates.add(id);
        }
      }
      var ids = Array.from(candidates);
      for (var i = 0; i < ids.length; i++) {
        if (stop) throw new Error('已停止；已完成的操作已保留，可再次同步');
        var id = ids[i], meta = remote.get(id), base = state.items[id];
        var local = localById.get(id);
        var localSig=await DiaryStore.digest(signature(local));
        if (!meta && base && incremental) {
          // Absence from a delta means unchanged, not deleted. Writes still verify current Notion content.
          meta = { pageId: base.pageId, version: base.version };
        }
        if (!meta) {
          if (base) { if (local) counter.missing++; continue; } // Never resurrect pages trashed in Notion.
          if (!local) continue;
          var created;
          try { created = await write( { entry: { ...local, source: sourceName(local.source) } }); }
          catch(error){if(error.status===409&&error.response?.pageId){var incoming=await call('/read',{pageId:error.response.pageId});if(incoming.pendingOperation)throw error;await mergeRemote(id,incoming,local,undefined);continue;}throw error;}
          await commit(id,created,remoteEntry(created,true),local); counter.up++;
          continue;
        }
        var localChanged = base ? base.hash !== localSig : !!local;
        // Notion timestamps can be rounded; recheck an unsettled timestamp once outside a two-minute window.
        var stamp = Date.parse(meta.version);
        var unsettled = precisionCheckDue(base, meta.version);
        var remoteChanged = !base || base.version !== meta.version || unsettled || (state.mediaVersion !== 1 && local && local.readOnly);
        if (!localChanged && !remoteChanged) continue;
        if (remoteChanged) {
          var value = await call('/read', { pageId: meta.pageId });
          if(value.pendingOperation)throw new Error('这篇日记有未完成的服务端操作，请回原设备再次同步以恢复');
          var incoming = value.deleted ? undefined : remoteEntry(value);
          var incomingSig = await DiaryStore.digest(signature(incoming));
          if (base && localChanged && incomingSig === base.hash) {
            var uploadPayload = local || { id:id,date:value.date,text:value.text,source:value.source,tags:value.tags,photos:value.photos||[],links:value.links||[] };
            var uploaded = await write( { pageId: base.pageId, baseVersion: value.version, baseHash: incomingSig,
              entry: { ...uploadPayload, source: sourceName(uploadPayload.source) }, deleted: !local });
            await commit(id,uploaded,uploaded.deleted?undefined:remoteEntry(uploaded,true),local); counter.up++;
            continue;
          }
          await mergeRemote(id, value, local, base);
          continue;
        }
        if (localChanged) {
          // Missing local record means explicit deletion after a previously synced baseline.
          var payload=local||DiaryStore.snapshot.deleted[id];
          if(!payload)throw new Error('删除快照缺失，请先完整核对');
          await writeExisting(id, payload, base, local);
        }
      }
      if (stop) throw new Error('已停止；同步时间点未推进，可再次同步');
      // Only a completely successful run advances the watermark; use START, not completion time.
      state.mediaVersion = 1;
      state.watermark = syncStartedAt;
      state.lastSync = new Date().toISOString();state.lastStats=counter;state.lastError='';
      await DiaryStore.saveScope(key,state);
      await DiaryStore.setConfig(targetKey,database);
      document.getElementById('sync-status').textContent = (incremental ? '增量同步：' : '完整核对：') + new Date(state.lastSync).toLocaleString() + '；上传' + counter.up + '条，更新本机' + counter.down + '条；读取正文' + counter.reads + '条，查询目录' + counter.catalogs + '页。' +
        (counter.conflict ? '冲突' + counter.conflict + '条：本机内容已另存副本，下次同步上传。' : '') +
        (counter.missing ? counter.missing + '条在Notion已移除，未自动重建；请先在Notion恢复。' : '');
      showToast(counter.conflict || counter.missing ? '同步完成，请查看设置里的冲突或移除提示' : '同步完成');
    } catch (error) {
      if(state&&key){state.lastError=error.message;try{await DiaryStore.saveScope(key,state);}catch(_){}}
      document.getElementById('sync-status').textContent = '同步未完成：' + error.message + '。请保留本机备份。';
      showToast('同步未完成，请查看设置中的提示');
    } finally {
      running = false; button.disabled = false; document.getElementById('full-sync-btn').disabled = false; dialog.close();
      await refreshDiaryData();
    }
    }).catch(function(error){showToast(error.message);});
  }
  var statusSequence=0;
  window.refreshSyncStatus=async function(){
    var sequence=++statusSequence;
    if(running)return;
    var endpoint=appSettings.syncUrl;if(!endpoint){document.getElementById('sync-status').textContent='未配置Worker；日记已存本机。';return;}
    var db=DiaryStore.config('syncTarget:'+endpoint,null),last=db?await DiaryStore.readSync('diary_sync_v1:'+endpoint+':'+db):null;
    var pending=0,localIndex=new Map(entries.map(e=>[e.id,e]));const ids=new Set(Array.from(localIndex.keys()).concat(Object.keys(last?.items||{})));
    for(const id of ids){const local=localIndex.get(id),base=last?.items[id];if(!base||base.hash!==await DiaryStore.digest(signature(local)))pending++;}
    if(sequence!==statusSequence||running)return;
    document.getElementById('sync-status').textContent=(last?.lastSync?'上次成功同步：'+new Date(last.lastSync).toLocaleString():'尚未同步')+'；本机待同步'+pending+'条。'+(last?.lastError?'最近同步未完成：'+last.lastError+'。':'')+(last?.lastStats?'上次上传'+last.lastStats.up+'条、更新本机'+last.lastStats.down+'条、读取正文'+last.lastStats.reads+'条。':'');
  };
  await refreshSyncStatus();
  document.getElementById('sync-btn').onclick = function () { window.lastSyncRun=runSync(false);return window.lastSyncRun; };
  document.getElementById('full-sync-btn').onclick = function () { window.lastSyncRun=runSync(true);return window.lastSyncRun; };
})();
