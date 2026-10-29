// diary-release: 2026.10.29.2
/* Main journal database. localStorage legacy data is read-only migration input. */
(function(){
 'use strict';
 const DB='timeline-diary-main',STORES=['entries','trash','deleted','meta','baselines','scopes','leases','drafts','secrets','operations'];
 let db,initializing,changeHook,refreshing;
 const actor=crypto.randomUUID(),channel=typeof BroadcastChannel==='function'?new BroadcastChannel('timeline-diary-main'):null;
 const copy=v=>v===undefined?undefined:structuredClone(v);
 const snapshot={entries:[],trash:[],deleted:{},hashes:{},configs:{},scopes:{},revision:0,drafts:[]};
 function canonical(e){if(!e)return '__DELETED__';let f=[e.date,e.text,e.source||'未署名',(e.tags||[]).slice().sort()];if((e.photos||[]).length||(e.links||[]).length)f.push((e.photos||[]).map(p=>[p.id,p.revision||'']),e.links||[]);return JSON.stringify(f);}
 async function digest(text){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');}
 const req=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 function transact(names,mode,work){return new Promise((resolve,reject)=>{const tx=db.transaction(names,mode);let result,error;tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(error||tx.error||new Error('本机事务未完成'));try{work(tx,v=>{result=v;},e=>{error=e;tx.abort();});}catch(e){error=e;tx.abort();}});}
 function bump(tx){const m=tx.objectStore('meta'),r=m.get('revision');r.onsuccess=()=>m.put({key:'revision',value:(r.result?.value||0)+1});}
 async function changed(){await refresh();channel?.postMessage({actor});if(changeHook)await changeHook(false);}
 function refresh(){
  const run=async()=>{
   const tx=db.transaction(['entries','trash','deleted','meta','scopes','drafts'],'readonly');
   const [rows,trash,deleted,meta,scopes,drafts]=await Promise.all(['entries','trash','deleted','meta','scopes','drafts'].map(n=>req(tx.objectStore(n).getAll())));
   snapshot.entries=rows.map(r=>r.entry);snapshot.hashes=Object.fromEntries(rows.map(r=>[r.id,r.hash]));snapshot.trash=trash.map(r=>r.entry);snapshot.deleted=Object.fromEntries(deleted.map(r=>[r.id,r.entry]));snapshot.scopes=Object.fromEntries(scopes.map(r=>[r.key,r.state]));snapshot.drafts=drafts;
   snapshot.configs={};for(const row of meta){if(row.key.startsWith('config:'))snapshot.configs[row.key.slice(7)]=row.value;if(row.key==='revision')snapshot.revision=row.value;}
   for(const row of meta)if(row.key.startsWith('configBackup:')&&snapshot.configs[row.key.slice(13)]===undefined)snapshot.configs[row.key.slice(13)]=row.value;
   return snapshot;
  };
  const queued=(refreshing||Promise.resolve()).catch(()=>{}).then(run);refreshing=queued;
  return queued.finally(()=>{if(refreshing===queued)refreshing=null;});
 }
 function parseLegacy(key,fallback){const raw=localStorage.getItem(key);return raw===null?fallback:JSON.parse(raw);}
 function validateEntry(e){if(!e||typeof e.id!=='string'||!e.id||e.id.length>100||typeof e.text!=='string'||typeof e.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||!Array.isArray(e.tags||[])||(e.tags||[]).some(t=>typeof t!=='string')||(e.source!==undefined&&typeof e.source!=='string')||!Array.isArray(e.photos||[])||!Array.isArray(e.links||[]))throw new Error('日记数据格式不正确，原数据未清除');return e;}
 async function ready(){
  if(initializing)return initializing;
  initializing=(async()=>{
   db=await new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{for(const n of STORES)r.result.createObjectStore(n,{keyPath:n==='baselines'?['scope','id']:n==='entries'||n==='trash'||n==='deleted'?'id':'key'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('请关闭旧窗口后重试本机存储升级'));});
   db.onversionchange=()=>db.close();
   let marker=await req(db.transaction('meta').objectStore('meta').get('migration'));
   if(!marker){
    let entries=parseLegacy('penang_timeline_diary',[]),trash=parseLegacy('penang_timeline_trash',[]);
    if(!Array.isArray(entries)||!Array.isArray(trash))throw new Error('旧版日记无法读取，未清理任何旧数据');
    const convert=v=>v==='user'?'五月':v==='yan'?'言':v==='G老师'?'叙':v||'未署名',legacyNames=!localStorage.getItem('penang_timeline_names_migrated');
    entries=entries.map(e=>({...validateEntry(e),tags:e.tags||[],source:legacyNames?convert(e.source):e.source||'未署名'}));trash=trash.map(e=>({...validateEntry(e),tags:e.tags||[],source:legacyNames?convert(e.source):e.source||'未署名'}));
    if(new Set(entries.map(e=>e.id)).size!==entries.length||new Set(trash.map(e=>e.id)).size!==trash.length)throw new Error('旧数据含重复日记ID，请先导出并检查');
    const rows=await Promise.all(entries.map(async entry=>({id:entry.id,entry,hash:await digest(canonical(entry))})));
    const configs=[];for(const key of ['penang_timeline_settings','penang_timeline_tags','penang_timeline_authors']){const value=parseLegacy(key,null);if(value!==null){const clean=key==='penang_timeline_settings'?Object.fromEntries(['syncUrl','bgUrl','scrim','cardOpacity','localBackground'].filter(k=>value[k]!==undefined).map(k=>[k,value[k]])):value;configs.push({key:'config:'+key,value:clean});}}
    // If a prior settings key exists, migrate appearance only; never copy GitHub credentials.
    if(!configs.some(c=>c.key==='config:penang_timeline_settings')){const old=parseLegacy('penang_timeline_gh_settings',null);if(old)configs.push({key:'config:penang_timeline_settings',value:{bgUrl:old.bgUrl||'',scrim:old.scrim??72,cardOpacity:old.cardOpacity??62}});}
    const baselines=[],scopes=[],deleted=[];
    for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith('diary_sync_target_v2:'))configs.push({key:'config:syncTarget:'+k.slice('diary_sync_target_v2:'.length),value:localStorage.getItem(k)});}
    for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!key?.startsWith('diary_sync_v1:'))continue;const old=parseLegacy(key,null);if(!old||!old.items)throw new Error('旧同步状态无法读取，未覆盖原数据');const state={...old};delete state.items;scopes.push({key,state});for(const [id,b]of Object.entries(old.items)){if(typeof b.signature!=='string')throw new Error('旧同步签名不正确');baselines.push({scope:key,id,...b,hash:await digest(b.signature),signature:undefined});if(!entries.some(e=>e.id===id)&&b.signature!=='__DELETED__'){const f=JSON.parse(b.signature);deleted.push({id,entry:trash.find(e=>e.id===id)||{id,date:f[0],text:f[1],source:f[2],tags:f[3],photos:(f[4]||[]).map(p=>Array.isArray(p)?{id:p[0],revision:p[1]}:{id:p}),links:f[5]||[]}});}}}
    const expected=await digest(JSON.stringify(entries.slice().sort((a,b)=>a.id.localeCompare(b.id))));
    await transact(STORES,'readwrite',(tx,set)=>{rows.forEach(r=>tx.objectStore('entries').put(r));trash.forEach(entry=>tx.objectStore('trash').put({id:entry.id,entry}));configs.forEach(r=>{tx.objectStore('meta').put(r);tx.objectStore('meta').put({key:'configBackup:'+r.key.slice(7),value:r.value});});tx.objectStore('meta').put({key:'legacyHashes',value:Object.fromEntries(rows.map(r=>[r.id,r.hash]))});baselines.forEach(r=>tx.objectStore('baselines').put(r));scopes.forEach(r=>tx.objectStore('scopes').put(r));deleted.forEach(r=>tx.objectStore('deleted').put(r));tx.objectStore('meta').put({key:'migration',value:{version:3,expected,count:entries.length,trashCount:trash.length,verified:false,at:Date.now()}});const legacyDraft=localStorage.getItem('penang_timeline_draft');if(legacyDraft){try{tx.objectStore('drafts').put({key:'legacy',value:JSON.parse(legacyDraft),updatedAt:Date.now()});}catch(_){}}bump(tx);set(true);});
    marker=await req(db.transaction('meta').objectStore('meta').get('migration'));
   }
   await refresh();
   if(!marker.value.verified){const actual=await digest(JSON.stringify(snapshot.entries.slice().sort((a,b)=>a.id.localeCompare(b.id))));if(actual!==marker.value.expected||snapshot.entries.length!==marker.value.count||snapshot.trash.length!==marker.value.trashCount)throw new Error('本机迁移校验未通过，旧数据仍保留');marker.value.verified=true;await transact(['meta'],'readwrite',tx=>tx.objectStore('meta').put(marker));}
   await repairHashes();
   await transact(['operations'],'readwrite',tx=>{const r=tx.objectStore('operations').getAll();r.onsuccess=()=>r.result.filter(o=>o.status==='done'&&o.completedAt<Date.now()-30*86400000).forEach(o=>tx.objectStore('operations').delete(o.key));});
   if(channel)channel.onmessage=async e=>{if(e.data.actor===actor)return;await refresh();if(changeHook)await changeHook(true);};
   return snapshot;
  })();return initializing;
 }
 async function upsert(entry,expected){validateEntry(entry);const row={id:entry.id,entry:copy(entry),hash:await digest(canonical(entry))},base=expected?(expected.__hash||await digest(canonical(expected))):null;const conflictId=crypto.randomUUID(),conflictEntry={...row.entry,id:conflictId,tags:Array.from(new Set((row.entry.tags||[]).concat('本机冲突')))},conflictHash=await digest(canonical(conflictEntry));
  const result=await transact(['entries','deleted','meta'],'readwrite',(tx,set)=>{const store=tx.objectStore('entries'),r=store.get(row.id);r.onsuccess=()=>{const old=r.result;let conflict=old?old.hash!==row.hash&&old.hash!==base:!!expected;if(conflict){row.id=conflictId;row.entry=conflictEntry;row.hash=conflictHash;}store.put(row);tx.objectStore('deleted').delete(row.id);bump(tx);set({id:row.id,conflict});};});await changed();return result;
 }
 async function remove(id,expected){const hash=await digest(canonical(expected));await transact(['entries','trash','deleted','meta'],'readwrite',(tx,set,abort)=>{const r=tx.objectStore('entries').get(id);r.onsuccess=()=>{if(!r.result||r.result.hash!==hash){abort(new Error('这篇日记已被其他窗口修改，请重新查看后再删除'));return;}const entry=r.result.entry;tx.objectStore('trash').put({id,entry:{...entry,deletedAt:Date.now()}});tx.objectStore('deleted').put({id,entry});tx.objectStore('entries').delete(id);bump(tx);};});await changed();}
 async function restore(id){
  await refresh();const found=snapshot.trash.find(e=>e.id===id);if(!found)return;const entry={...found};delete entry.deletedAt;const hash=await digest(canonical(entry)),conflictId=crypto.randomUUID(),conflictEntry={...entry,id:conflictId,tags:Array.from(new Set((entry.tags||[]).concat('本机冲突')))},conflictHash=await digest(canonical(conflictEntry));
  await transact(['entries','trash','deleted','meta'],'readwrite',(tx,set,abort)=>{const t=tx.objectStore('trash').get(id);t.onsuccess=()=>{if(!t.result||canonical(t.result.entry)!==canonical(found)){abort(new Error('回收站记录有更新，请重试'));return;}const r=tx.objectStore('entries').get(id);r.onsuccess=()=>{if(!r.result)tx.objectStore('entries').put({id,entry,hash});else if(r.result.hash!==hash)tx.objectStore('entries').put({id:conflictId,entry:conflictEntry,hash:conflictHash});tx.objectStore('trash').delete(id);tx.objectStore('deleted').delete(id);bump(tx);};};});await changed();}
 async function repairHashes(){const rows=await req(db.transaction('entries').objectStore('entries').getAll());const missing=await Promise.all(rows.filter(r=>!r.hash).map(async r=>({...r,hash:await digest(canonical(r.entry))})));if(missing.length)await transact(['entries'],'readwrite',tx=>missing.forEach(r=>tx.objectStore('entries').put(r)));}
 async function purge(id){await transact(['trash','meta'],'readwrite',tx=>{tx.objectStore('trash').delete(id);bump(tx);});await changed();}
 async function purgeExpired(){const rows=await req(db.transaction('trash').objectStore('trash').getAll());const old=rows.filter(r=>(r.entry.deletedAt||0)<Date.now()-7*86400000);if(old.length){await transact(['trash','meta'],'readwrite',tx=>{old.forEach(r=>tx.objectStore('trash').delete(r.id));bump(tx);});await changed();}}
 function config(key,fallback){return copy(snapshot.configs[key]===undefined?fallback:snapshot.configs[key]);}
 async function setConfig(key,value){await transact(['meta'],'readwrite',tx=>{tx.objectStore('meta').put({key:'config:'+key,value:copy(value)});tx.objectStore('meta').put({key:'configBackup:'+key,value:copy(value)});bump(tx);});snapshot.configs[key]=copy(value);channel?.postMessage({actor});}
 async function configureSync(syncUrl,value,remember){
  await transact(['meta','secrets'],'readwrite',tx=>{const meta=tx.objectStore('meta'),r=meta.get('config:penang_timeline_settings');r.onsuccess=()=>{const settings={...(r.result?.value||snapshot.configs.penang_timeline_settings||{}),syncUrl};meta.put({key:'config:penang_timeline_settings',value:settings});meta.put({key:'configBackup:penang_timeline_settings',value:settings});};
   if(remember&&value)tx.objectStore('secrets').put({key:'sync',value});else tx.objectStore('secrets').delete('sync');bump(tx);
  });await changed();
 }
 async function secret(value){if(value!==undefined)await transact(['secrets'],'readwrite',tx=>value?tx.objectStore('secrets').put({key:'sync',value}):tx.objectStore('secrets').delete('sync'));return(await req(db.transaction('secrets').objectStore('secrets').get('sync')))?.value||'';}
 async function readSync(key){const tx=db.transaction(['scopes','baselines']);const [scope,rows]=await Promise.all([req(tx.objectStore('scopes').get(key)),req(tx.objectStore('baselines').getAll())]);return {...(scope?.state||{}),items:Object.fromEntries(rows.filter(r=>r.scope===key).map(r=>[r.id,r]))};}
 async function saveScope(key,state){const clean={...state};delete clean.items;await transact(['scopes'],'readwrite',tx=>tx.objectStore('scopes').put({key,state:clean}));snapshot.scopes[key]=clean;channel?.postMessage({actor});}
 async function syncCommit(key,id,value,entry,expected,options={},extras=[]){
  const hash=await digest(canonical(entry)),expectedHash=await digest(canonical(expected));
  const extrasRows=await Promise.all(extras.map(async e=>({id:e.id,entry:e,hash:await digest(canonical(e))})));
  const base={scope:key,id,pageId:value.pageId,version:value.version,checkedAt:Date.now(),hash};
  await transact(['entries','trash','deleted','baselines','meta','operations'],'readwrite',(tx,set,abort)=>{const r=tx.objectStore('entries').get(id);r.onsuccess=()=>{const current=r.result?.hash;const empty=expected===undefined;if((empty&&r.result)||(!empty&&current!==expectedHash)){abort(new Error('同步时另一窗口修改了日记，已保留本机内容，请再次同步'));return;}
   if(options.keepLocal){}else if(entry)tx.objectStore('entries').put({id,entry:copy(entry),hash});else{if(expected)tx.objectStore('trash').put({id,entry:{...expected,deletedAt:Date.now()},hash:expectedHash});tx.objectStore('entries').delete(id);}
   extrasRows.forEach(row=>tx.objectStore('entries').put(row));tx.objectStore('baselines').put(base);if(options.operation){tx.objectStore('operations').put({key:options.operation.key,scope:options.operation.scope,entryId:options.operation.entryId,status:'done',completedAt:Date.now()});}bump(tx);set(true);
  };});await changed();return base;
 }
 async function exclusive(name,fn){const owner=crypto.randomUUID();async function claim(){return transact(['leases'],'readwrite',(tx,set)=>{const s=tx.objectStore('leases'),r=s.get(name);r.onsuccess=()=>{if(r.result&&r.result.until>Date.now()&&r.result.owner!==owner){set(false);return;}s.put({key:name,owner,until:Date.now()+180000});set(true);};});}
  if(!await claim())throw new Error('另一个窗口正在处理相同操作，请稍后重试');
  const timer=setInterval(()=>transact(['leases'],'readwrite',tx=>{const r=tx.objectStore('leases').get(name);r.onsuccess=()=>{if(r.result?.owner===owner)tx.objectStore('leases').put({key:name,owner,until:Date.now()+180000});};}).catch(()=>{}),30000);
  try{return await fn();}finally{clearInterval(timer);await transact(['leases'],'readwrite',tx=>{const r=tx.objectStore('leases').get(name);r.onsuccess=()=>{if(r.result?.owner===owner)tx.objectStore('leases').delete(name);};});}
 }
 async function draft(key,value){await transact(['drafts'],'readwrite',tx=>value?tx.objectStore('drafts').put({key,value,updatedAt:Date.now()}):tx.objectStore('drafts').delete(key));}
 async function dump(){await refresh();return copy({entries:snapshot.entries,trash:snapshot.trash,configs:snapshot.configs,drafts:snapshot.drafts,deleted:Object.values(snapshot.deleted)});}
 async function importData(data){const rows=await Promise.all(data.entries.map(async e=>({id:e.id,entry:validateEntry(copy(e)),hash:await digest(canonical(e))})));let added=0;
  await transact(['entries','trash','deleted','meta','scopes','drafts'],'readwrite',tx=>{rows.forEach(row=>{const r=tx.objectStore('entries').get(row.id);r.onsuccess=()=>{if(!r.result){tx.objectStore('entries').put(row);tx.objectStore('trash').delete(row.id);tx.objectStore('deleted').delete(row.id);added++;}};});for(const draft of data.drafts||[])tx.objectStore('drafts').put({key:'backup:'+crypto.randomUUID(),value:draft.value,updatedAt:draft.updatedAt||Date.now()});for(const e of data.trash||[]){if(rows.some(row=>row.id===e.id))continue;const exists=tx.objectStore('entries').get(e.id);exists.onsuccess=()=>{if(!exists.result)tx.objectStore('trash').put({id:e.id,entry:validateEntry(e)});};}for(const [key,value]of Object.entries(data.configs||{})){const r=tx.objectStore('meta').get('config:'+key);r.onsuccess=()=>{if(!r.result){tx.objectStore('meta').put({key:'config:'+key,value});tx.objectStore('meta').put({key:'configBackup:'+key,value});}};}const scopes=tx.objectStore('scopes').getAll();scopes.onsuccess=()=>scopes.result.forEach(r=>{delete r.state.watermark;tx.objectStore('scopes').put(r);});bump(tx);});await changed();return added;
 }
 async function patchPhotos(id,photos){
  const row=await req(db.transaction('entries').objectStore('entries').get(id));if(!row)return;
  const map=new Map(photos.map(p=>[p.id,p])),entry={...row.entry,photos:(row.entry.photos||[]).map(p=>({...p,...map.get(p.id)}))},hash=await digest(canonical(entry));
  await transact(['entries','meta'],'readwrite',(tx,set,abort)=>{const r=tx.objectStore('entries').get(id);r.onsuccess=()=>{if(r.result?.hash!==row.hash){abort(new Error('其他窗口正在编辑这篇日记，请稍后查看图片'));return;}tx.objectStore('entries').put({id,entry,hash});bump(tx);};});await changed();
 }
 async function legacyEvent(event){
  if(event.key!=='penang_timeline_diary'||!event.newValue)return;
  try{const rows=JSON.parse(event.newValue);if(!Array.isArray(rows))return;
   const initial=(await req(db.transaction('meta').objectStore('meta').get('legacyHashes')))?.value||{},seen=(await req(db.transaction('meta').objectStore('meta').get('legacySeen')))?.value||{};
   for(const entry of rows){validateEntry(entry);const hash=await digest(canonical(entry));if(hash===initial[entry.id]||hash===seen[entry.id])continue;await upsert(entry,initial[entry.id]?{__hash:initial[entry.id]}:undefined);seen[entry.id]=hash;}
   await transact(['meta'],'readwrite',tx=>tx.objectStore('meta').put({key:'legacySeen',value:seen}));
   if(window.showToast)showToast('检测到旧版窗口写入，已保留变更；请关闭旧版并更新后使用');
  }catch(_){if(window.showToast)showToast('旧版窗口的数据格式有误，请先导出旧版备份');}
 }
 window.addEventListener('storage',event=>{if(db)legacyEvent(event);});
 async function operation(value){if(value)await transact(['operations'],'readwrite',tx=>tx.objectStore('operations').put(copy(value)));return req(db.transaction('operations').objectStore('operations').getAll());}
 async function allSync(){const tx=db.transaction(['scopes','baselines']);const [scopes,baselines]=await Promise.all([req(tx.objectStore('scopes').getAll()),req(tx.objectStore('baselines').getAll())]);return{scopes,baselines};}
 window.DiaryStore={ready,refresh,snapshot,canonical,digest,upsert,remove,restore,purge,purgeExpired,config,setConfig,configureSync,secret,readSync,saveScope,syncCommit,exclusive,draft,dump,importData,patchPhotos,validateEntry,onChange:fn=>changeHook=fn,actor,operation,allSync};
})();
