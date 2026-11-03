// diary-release: 2026.11.03.13
(function(){
 'use strict';
 const status=document.getElementById('backup-status');
 const configKeys=['penang_timeline_settings','penang_timeline_tags','penang_timeline_authors'];
 const mb=n=>(n/1048576).toFixed(1)+' MB';
 function download(value,name){const url=URL.createObjectURL(value instanceof Blob?value:new Blob([JSON.stringify(value)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function photoRefs(snapshot){const refs=[];for(const entry of snapshot.entries.concat(snapshot.trash)){for(const photo of entry.photos||[])refs.push({entry,photo});}for(const draft of snapshot.drafts||[]){const value=draft.value.snapshot||draft.value;for(const photo of value.photos||[])refs.push({entry:value,photo});}return refs;}
 async function validBlob(photo){if(photo.revision&&photo.localRevision!==photo.revision)return null;const key=photo.cacheKey||photo.id,blob=await MediaAssets.store('get',key);if(!(blob instanceof Blob))return null;return blob;}
 async function stableBlob(blob){return new Blob([await blob.arrayBuffer()],{type:blob.type});}
 async function fetchPhoto(photo){const c=DiaryNet.credentials();if(!photo.pageId)throw new Error('图片没有云端页面引用，本机文件也缺失');return DiaryNet.request(c.url+'/download',{method:'POST',headers:{...c.headers,'Content-Type':'application/json'},body:JSON.stringify({pageId:photo.pageId,photoId:photo.id,revision:photo.revision})},120000,'blob');}
 async function exportBackup(full){
  let stage='读取本机日记';
  try{await DiaryStore.exclusive('maintenance',async()=>{
   document.getElementById('full-backup-btn').disabled=document.getElementById('export-json-btn').disabled=true;
   try{
    const snapshot=await DiaryStore.dump();const from=document.getElementById('backup-from').value,to=document.getElementById('backup-to').value;if(from&&to&&from>to)throw new Error('备份起始日期不能晚于结束日期');const inRange=e=>(!from||e.date>=from)&&(!to||e.date<=to);snapshot.entries=snapshot.entries.filter(inRange);snapshot.trash=snapshot.trash.filter(inRange);snapshot.drafts=snapshot.drafts.filter(d=>inRange(d.value.snapshot||d.value));snapshot.configs=Object.fromEntries(configKeys.filter(k=>snapshot.configs[k]!==undefined).map(k=>[k,snapshot.configs[k]]));
    if(snapshot.configs.penang_timeline_settings)snapshot.configs.penang_timeline_settings=Object.fromEntries(['syncUrl','bgUrl','scrim','cardOpacity','localBackground'].filter(k=>snapshot.configs.penang_timeline_settings[k]!==undefined).map(k=>[k,snapshot.configs.penang_timeline_settings[k]]));
    const backup={format:'timeline-diary',version:4,createdAt:new Date().toISOString(),...snapshot,assets:[],manifest:{complete:true,missing:[],mode:full?'full':'local',range:{from,to}}};
    const cached=new Set(),zipFiles=new Map();const seen=new Map(),refs=photoRefs(backup),retrieved=new Map();
    for(let i=0;i<refs.length;i++){
     const {entry,photo}=refs[i],identity=(photo.pageId||'local')+':'+photo.id+':'+(photo.revision||'');
     status.textContent=(full?'完整备份':'本机备份')+'：处理图片 '+(i+1)+' / '+refs.length;
     try{
      let blob;
      try{const local=await validBlob(photo);if(local)blob=await stableBlob(local);}catch(error){if(!full)throw error;}
      const localKey=blob&&(photo.cacheKey||photo.id);
      if(!blob&&full){blob=retrieved.get(identity);if(!blob){blob=await stableBlob(await fetchPhoto(photo));retrieved.set(identity,blob);}}
      if(!blob)throw new Error('图片仅在云端，未包含原文件');
      const hash=await MediaAssets.hash(blob);
      if(!seen.has(hash)){const path='assets/'+hash+'.bin';backup.assets.push({key:hash,hash,mime:blob.type,path});zipFiles.set(path,blob);seen.set(hash,true);}
      photo.cacheKey=hash;photo.localRevision=photo.revision;
      // Keep ZIP inputs independent of IndexedDB's file-backed Blob lifetime.
      if(localKey===hash)cached.add(hash);
      else try{await MediaAssets.store('put',hash,blob);cached.add(hash);}catch(_){}
     }catch(error){backup.manifest.complete=false;backup.manifest.missing.push({entryId:entry.id||'draft',photoId:photo.id,reason:error.message});}
    }
    if(full)for(const entry of backup.entries.concat(backup.trash)){if(entry.readOnly){backup.manifest.complete=false;backup.manifest.missing.push({entryId:entry.id,reason:'此Notion页面含复杂格式或超限内容，PWA只保存预览；原页面需另行从Notion导出'});}}
    stage='读取本机背景图';
    try{
     const stored=await MediaAssets.store('get','background');
     if(stored instanceof Blob){const background=await stableBlob(stored),hash=await MediaAssets.hash(background);backup.backgroundKey=hash;if(!seen.has(hash)){const path='assets/'+hash+'.bin';backup.assets.push({key:hash,hash,mime:background.type,path});zipFiles.set(path,background);}}
    }catch(error){backup.manifest.complete=false;backup.manifest.missing.push({asset:'background',reason:'本机背景图无法读取：'+error.message});}
    stage='读取同步备份信息';
    backup.archivedSync=await DiaryStore.allSync();backup.archivedOperations=await DiaryStore.operation();
    if(full&&!backup.manifest.complete&&!confirm('有'+backup.manifest.missing.length+'项未取得完整内容。是否导出明确标记为“不完整”的备份？')){status.textContent='完整备份未完成，未下载文件。请先同步或查看缺失提示。';return;}
    // Store cache references as metadata only; never replay a stale document snapshot into the live database.
    for(const entry of backup.entries){const photos=entry.photos||[];if(photos.length)await DiaryStore.patchPhotos(entry.id,photos.filter(p=>cached.has(p.cacheKey)).map(p=>({id:p.id,cacheKey:p.cacheKey,localRevision:p.localRevision}))).catch(()=>{});}
    stage='生成备份压缩包';
    const zip=await DiaryArchive.build([{name:'manifest.json',blob:new Blob([JSON.stringify(backup)],{type:'application/json'})}].concat(Array.from(zipFiles,([name,blob])=>({name,blob}))));download(zip,'timeline-diary-'+(backup.manifest.complete?'complete':'partial')+'-'+todayStr()+'.zip');
    status.textContent=(backup.manifest.complete?'备份完成':'已导出不完整备份')+'：'+backup.entries.length+'篇日记、'+backup.trash.length+'条回收站、'+backup.assets.length+'个图片文件'+(backup.manifest.missing.length?'；缺失'+backup.manifest.missing.length+'项，详情在文件manifest中':'')+'。不包含口令。';
   }finally{document.getElementById('full-backup-btn').disabled=document.getElementById('export-json-btn').disabled=false;}
  });}catch(error){status.textContent='备份未完成（'+stage+'）：'+(error.name==='NotFoundError'?'手机无法读取对应的本机文件或存储项目；请保留本机数据，重新打开日记后再试。':error.message);}
 }
 function validEntry(e){DiaryStore.validateEntry(e);if((e.tags||[]).some(t=>typeof t!=='string')||(e.source&&e.source.length>100)||(!e.readOnly&&((e.photos||[]).length>8||(e.links||[]).length>8))||(e.photos||[]).some(p=>!p||! /^[a-zA-Z0-9_-]{1,100}$/.test(p.id))||(e.links||[]).some(u=>!MediaAssets.safeLink(u)))throw new Error('备份日记格式不正确');return e;}
 async function importBackup(file){
  const isZip=new Uint8Array(await file.slice(0,4).arrayBuffer());const archive=isZip[0]===80&&isZip[1]===75?await DiaryArchive.read(file):null;
  const parsed=JSON.parse(archive?await(await archive.get('manifest.json')).text():await file.text()),legacy=Array.isArray(parsed),version=legacy?1:parsed.version;
  if(!legacy&&(parsed.format!=='timeline-diary'||![2,3,4].includes(version)))throw new Error('不支持此备份格式');
  const records=legacy?parsed:parsed.entries;if(!Array.isArray(records))throw new Error('备份没有日记数组');
  const entries=records.map(e=>({...validEntry(e),source:legacy?legacySourceName(e.source):sourceName(e.source),tags:e.tags||[],photos:e.photos||[],links:e.links||[]}));
  if(new Set(entries.map(e=>e.id)).size!==entries.length)throw new Error('备份包含重复日记ID');
  const trash=version>=3?(parsed.trash||[]).map(validEntry):[];
  if(!Array.isArray(parsed.assets||[]))throw new Error('图片数组格式不正确');
  const assets=[];
  for(const item of legacy?[]:parsed.assets||[]){
   const key=version===2?item.id:item.key,expected=version===2?item.id:item.hash;
   let blob;
   if(version===4){if(!archive||typeof item.path!=='string'||item.path!=='assets/'+expected+'.bin'||!/^image\/(jpeg|png|webp|gif|heic|heif)$/.test(item.mime))throw new Error('备份图片目录格式不正确');const raw=await archive.get(item.path);blob=new Blob([raw],{type:item.mime});}
   else{if(typeof item.data!=='string'||!/^data:image\/(jpeg|png|webp|gif|heic|heif);base64,[A-Za-z0-9+/=]+$/.test(item.data)||item.data.length>28000000)throw new Error('备份图片格式或大小不正确');const parts=item.data.split(','),bytes=Uint8Array.from(atob(parts[1]),c=>c.charCodeAt(0));blob=new Blob([bytes],{type:parts[0].slice(5,-7)});}
   const hash=await MediaAssets.hash(blob);
   if(blob.size>20000000||hash!==expected||key!==expected)throw new Error('图片校验失败，未导入日记');assets.push({key,blob});
  }
  const available=new Set(assets.map(a=>a.key)),missing=[];
  for(const {photo} of photoRefs({entries,trash,drafts:version>=3?parsed.drafts||[]:[]})){const key=photo.cacheKey||photo.id;if(!available.has(key)&&!await validBlob(photo))missing.push(key);}
  if((parsed.manifest?.complete===false||missing.length)&&!confirm('此备份有未包含的内容或图片。仍要导入已包含的数据？'))return;
  const configs={};if(version>=3){
   for(const key of configKeys)if(parsed.configs?.[key]!==undefined)configs[key]=parsed.configs[key];
   const settings=configs.penang_timeline_settings;
   if(settings){if(typeof settings!=='object'||Array.isArray(settings))throw new Error('设置格式不正确');const allowed=['syncUrl','bgUrl','scrim','cardOpacity','localBackground'];configs.penang_timeline_settings=Object.fromEntries(allowed.filter(k=>settings[k]!==undefined).map(k=>[k,settings[k]]));if(settings.syncUrl){const u=new URL(settings.syncUrl);if(u.protocol!=='https:'||u.pathname!=='/'||u.username||u.password||u.search||u.hash)throw new Error('备份中的Worker地址不正确');if(!DiaryStore.config('penang_timeline_settings',null)&&!confirm('将恢复Worker地址 '+u.origin+'。请确认这是你自己的同步服务；备份不包含口令。继续？'))return;}}
   if(configs.penang_timeline_tags&&(!Array.isArray(configs.penang_timeline_tags)||configs.penang_timeline_tags.some(t=>typeof t!=='string')))throw new Error('标签设置格式不正确');
   if(configs.penang_timeline_authors){const a=configs.penang_timeline_authors;if(typeof a.defaultName!=='string'||!Array.isArray(a.names)||!Array.isArray(a.hidden)||a.names.concat(a.hidden).some(n=>typeof n!=='string')||typeof a.subtitle!=='string')throw new Error('记录人设置格式不正确');}
  }
  for(const a of assets)await MediaAssets.store('put',a.key,a.blob);
  if(version>=3&&parsed.backgroundKey){const bg=assets.find(a=>a.key===parsed.backgroundKey);if(bg)await MediaAssets.store('put','background',bg.blob);}
  const added=await DiaryStore.importData({entries,trash,configs,drafts:version>=3?parsed.drafts||[]:[]});
  await refreshDiaryData();appSettings=loadSettings();document.getElementById('sync-url').value=appSettings.syncUrl||'';document.getElementById('bg-url').value=appSettings.bgUrl||'';document.getElementById('bg-scrim-input').value=appSettings.scrim??72;document.getElementById('card-opacity-input').value=appSettings.cardOpacity??62;PRESET_TAGS=DiaryStore.config(TAGS_KEY,DEFAULT_TAGS.slice());AuthorSettings.reload();renderManageTagChips();applyBackground(appSettings.bgUrl);status.textContent='已导入'+added+'篇新日记。已有同ID日记未覆盖；下次同步将完整核对，备份中的删除/未完成云端操作不会自动执行。'+(missing.length?'有'+missing.length+'个云端引用需联网查看。':'');
 }
 async function storageInfo(){const items=await MediaAssets.assetInfo(),bytes=items.reduce((n,a)=>n+a.bytes,0),estimate=await navigator.storage?.estimate?.();document.getElementById('storage-status').textContent='本机图片 '+mb(bytes)+'，'+items.filter(a=>a.bytes).length+'个文件'+(estimate?.usage?'；站点总用量约'+mb(estimate.usage):'')+'。';}
 async function cleanup(){
  try{await DiaryStore.exclusive('maintenance',async()=>{
   const snapshot=await DiaryStore.dump(),roots=new Set(['background']);
   for(const {photo}of photoRefs(snapshot))roots.add(photo.cacheKey||photo.id);
   for(const op of await DiaryStore.operation())if(op.status==='pending')for(const photo of op.payload?.entry?.photos||[])roots.add(photo.cacheKey||photo.id);
   const items=await MediaAssets.assetInfo(),eligible=items.filter(a=>!roots.has(a.key)&&(a.upload&&Date.parse(a.expiresAt)<Date.now()||a.touchedAt<Date.now()-7*86400000));
   if(!eligible.length){showToast('没有可安全清理的旧图片或上传缓存');await storageInfo();return;}
   if(!confirm('清理'+eligible.length+'个过期缓存或超过7天的无引用文件？日记、回收站和草稿图片会保留。'))return;
   const result=await MediaAssets.cleanupAssets(roots);showToast('已清理'+result.removed+'项，释放'+mb(result.bytes));await storageInfo();
  });}catch(error){showToast('清理未完成：'+error.message);}
 }
 document.getElementById('export-json-btn').onclick=()=>exportBackup(false);
 document.getElementById('full-backup-btn').onclick=()=>exportBackup(true);
 document.getElementById('import-json-btn').onclick=()=>document.getElementById('import-json-input').click();
 document.getElementById('import-json-input').onchange=async event=>{const file=event.target.files[0];event.target.value='';if(!file)return;try{await DiaryStore.exclusive('maintenance',()=>importBackup(file));}catch(error){status.textContent='导入未完成，原日记未清空：'+error.message;}};
 document.getElementById('storage-refresh').onclick=()=>storageInfo().catch(e=>showToast(e.message));document.getElementById('storage-cleanup').onclick=cleanup;
 // Range chips fill the (kept) date inputs; the summary says how many diaries a backup will contain.
 const fromEl=document.getElementById('backup-from'),toEl=document.getElementById('backup-to'),summary=document.getElementById('backup-summary');
 const pad=n=>String(n).padStart(2,'0'),iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
 function updateSummary(){
  const from=fromEl.value,to=toEl.value,bad=from&&to&&from>to;summary.classList.toggle('is-error',!!bad);
  if(bad){summary.textContent='起始日期不能晚于结束日期';return;}
  const count=entries.filter(e=>(!from||e.date>=from)&&(!to||e.date<=to)).length;
  summary.textContent='将备份 '+count+' 篇日记 · '+(from||to?(from||'最早')+' 至 '+(to||'今天'):'全部日期');
 }
 function setRange(kind){
  document.querySelectorAll('.range-chip').forEach(chip=>{const on=chip.dataset.range===kind;chip.classList.toggle('is-active',on);chip.setAttribute('aria-pressed',String(on));});
  document.getElementById('backup-custom-range').hidden=kind!=='custom';
  const now=new Date();
  if(kind==='all'){fromEl.value='';toEl.value='';}
  else if(kind==='30'){const d=new Date(now);d.setDate(d.getDate()-29);fromEl.value=iso(d);toEl.value='';}
  else if(kind==='year'){fromEl.value=now.getFullYear()+'-01-01';toEl.value='';}
  updateSummary();
 }
 document.querySelectorAll('.range-chip').forEach(chip=>chip.onclick=()=>setRange(chip.dataset.range));
 fromEl.addEventListener('change',updateSummary);toEl.addEventListener('change',updateSummary);
 document.getElementById('data-toggle').addEventListener('click',updateSummary);
 setRange('all');
 window.DiaryBackup={exportBackup,importBackup,storageInfo,cleanup};
})();
