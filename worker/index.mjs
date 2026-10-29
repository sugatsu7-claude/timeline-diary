// Manual-only Notion bridge. Deploy this file as your Cloudflare Worker.
const VERSION = '2025-09-03';
const MAX_TEXT = 30000;
const schemaReady=new Map(),dataSourceCache=new Map();
async function digest(text){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');}
// Keep the deadline active through body decoding, including a stalled image stream.
async function timedFetch(url,options={},timeout=25000,consume=async response=>response.json()){
 const controller=new AbortController();let timer;
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Failure(504,'Notion请求超时，已完成的步骤会在重试时核对'));},timeout);});
 try{return await Promise.race([(async()=>consume(await fetch(url,{...options,signal:controller.signal})))(),deadline]);}finally{clearTimeout(timer);}
}
class Failure extends Error { constructor(status, message) { super(message); this.status = status; } }
function fail(status,message,details){const error=new Failure(status,message);error.details=details;throw error;}
const plain = items => (items || []).map(t => t.plain_text ?? t.text?.content ?? '').join('');
const compact = id => String(id).replaceAll('-', '');
function rich(text) {
  const parts = [];
  // Array.from avoids splitting emoji surrogate pairs across Notion text elements.
  const chars = Array.from(text);
  for (let i = 0; i < chars.length; i += 1000) parts.push({ type: 'text', text: { content: chars.slice(i, i + 1000).join('') } });
  return parts;
}
function metadata(page) {
  const p = page.properties;
  return { id: plain(p['日记ID']?.rich_text) || 'notion-' + compact(page.id), pageId: page.id,
    version: page.last_edited_time, deleted: p['已删除']?.checkbox === true,
    date: p['日期']?.date?.start?.slice(0, 10) || '', source: p['记录人']?.select?.name || '未署名',
    tags: (p['标签']?.multi_select || []).map(t => t.name), title: plain(p['标题']?.title),
    createdAt: p['原始创建时间']?.number || Date.parse(page.created_time) || 0 };
}
function validate(entry) {
  if (!entry || typeof entry.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(entry.id) ||
      ['__proto__', 'constructor', 'prototype'].includes(entry.id) ||
      typeof entry.text !== 'string' || (!entry.text.trim() && !(entry.photos || []).length && !(entry.links || []).length) || entry.text.length > MAX_TEXT ||
      !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || Number.isNaN(Date.parse(entry.date)) ||
      typeof entry.source !== 'string' || !entry.source.trim() || entry.source.length > 100 || entry.source.includes(',') ||
      !Array.isArray(entry.tags) || entry.tags.length > 30 || entry.tags.some(t => typeof t !== 'string' || !t || t.length > 100 || t.includes(','))) {
    fail(400, '日记格式不正确：正文限30000字，标签限30个，记录人和标签不可包含逗号');
  }
}
function safeLink(value) { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password && value.length <= 2000; } catch { return false; } }
function attachments(entry) {
  if (!Array.isArray(entry.photos || []) || (entry.photos || []).length > 8 || (entry.photos || []).some(p => !p || !/^[a-zA-Z0-9_-]{1,100}$/.test(p.id))) fail(400, '每条日记最多8张图片');
  if (!Array.isArray(entry.links || []) || (entry.links || []).length > 8 || (entry.links || []).some(u => !safeLink(u))) fail(400, '链接须为HTTP/HTTPS，每条最多8个');
  if (new Set((entry.photos || []).map(p=>p.id)).size !== (entry.photos || []).length) fail(400, '图片ID重复');
}
function imageBlock(photo) {
  const content = photo.fileUploadId ? { type: 'file_upload', file_upload: { id: photo.fileUploadId } } :
    photo.externalUrl && safeLink(photo.externalUrl) ? { type: 'external', external: { url: photo.externalUrl } } : null;
  if (!content || (photo.fileUploadId && !/^[a-f0-9-]{32,36}$/i.test(photo.fileUploadId))) fail(400, '图片尚未上传，请重新同步');
  return { object: 'block', type: 'image', image: { ...content, caption: rich('diary-image:' + photo.id) } };
}
function children(entry) {
  return [{ object: 'block', type: 'paragraph', paragraph: { rich_text: rich(entry.text) } }]
    .concat((entry.photos || []).map(imageBlock), (entry.links || []).map(url => ({ object: 'block', type: 'bookmark', bookmark: { url } })));
}
function properties(entry, deleted = false) {
  return { '标题': { title: rich(entry.text.slice(0, 60).replace(/\s+/g, ' ') || entry.date) },
    '日期': { date: { start: entry.date } }, '记录人': { select: { name: entry.source } },
    '标签': { multi_select: [...new Set(entry.tags)].map(name => ({ name })) },
    '日记ID': { rich_text: rich(entry.id) }, '已删除': { checkbox: deleted },
    '原始创建时间': { number: Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now() } };
}
function signature(entry) {
  if (entry.deleted) return '__DELETED__';
  const fields = [entry.date, entry.text, entry.source, entry.tags.slice().sort()];
  if ((entry.photos || []).length || (entry.links || []).length) fields.push((entry.photos || []).map(p=>[p.id,p.revision||'']), entry.links || []);
  return JSON.stringify(fields);
}
function same(a,b){
  return a.text===b.text&&a.date===b.date&&a.source===b.source&&JSON.stringify(a.tags.slice().sort())===JSON.stringify(b.tags.slice().sort())&&JSON.stringify(a.links||[])===JSON.stringify(b.links||[])&&
    (a.photos||[]).length===(b.photos||[]).length&&(b.photos||[]).every((p,i)=>a.photos[i].id===p.id&&(!p.revision||a.photos[i].revision===p.revision));
}
function marker(page){try{return JSON.parse(plain(page.properties['同步操作']?.rich_text)||'null');}catch{fail(409,'Notion同步操作记录格式有误，请先检查该页面');}}


export default {
  async fetch(request, env) {
    env={...env}; // Resolve request configuration without mutating shared Worker bindings.
    const origin = request.headers.get('Origin');
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin' };
    if (origin && origin === env.ALLOWED_ORIGIN) headers['Access-Control-Allow-Origin'] = origin;
    const respond = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
    try {
      if (!env.WORKER_SECRET || !env.NOTION_TOKEN || (!env.NOTION_DATA_SOURCE_ID && !env.NOTION_DATABASE_ID) || !env.ALLOWED_ORIGIN) fail(503, 'Worker配置不完整');
      if (origin && origin !== env.ALLOWED_ORIGIN) fail(403, '网站来源未获允许');
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: { ...headers,
          'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '86400' } });
      }
      if (request.method !== 'POST') fail(405, '请使用POST');
      // Hash before comparison; reject missing configuration above (fail closed).
      const supplied = request.headers.get('Authorization') || '';
      const authDigest = text => crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      const [a, b] = await Promise.all([authDigest(supplied), authDigest('Bearer ' + env.WORKER_SECRET)]);
      const aa = new Uint8Array(a), bb = new Uint8Array(b);
      let difference = 0;
      for (let i = 0; i < aa.length; i++) difference |= aa[i] ^ bb[i];
      if (difference) fail(401, '同步口令不正确');
      const path = new URL(request.url).pathname;
      let input, uploadFile;
      if (path === '/upload') {
        if (Number(request.headers.get('Content-Length')) > 2200000) fail(413, '图片超过2MB');
        const form = await request.formData();
        uploadFile = form.get('file'); input = {};
      } else {
        const raw = await request.text();
        if (raw.length > 180000) fail(413, '请求过大');
        try { input = JSON.parse(raw); } catch { fail(400, '无效JSON'); }
      }
      // One request at a time, no retry loops. PWA requests are deliberately paced.
      async function api(path, method = 'GET', body) {
        await new Promise(resolve => setTimeout(resolve, 400));
        return timedFetch('https://api.notion.com/v1/' + path, { method,
          headers: { Authorization: 'Bearer ' + env.NOTION_TOKEN, 'Notion-Version': VERSION, ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
          body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) },25000,async response=>{
        if (!response.ok) {
          if (response.status === 429) fail(429, 'Notion请求频率受限，请稍后手动重试');
          if (response.status === 401 || response.status === 403) fail(502, 'Notion密钥或数据库授权有误');
          if (response.status === 404) fail(404, 'Notion页面或数据库不存在，或尚未授权连接');
          fail(502, 'Notion请求失败（' + response.status + '），请检查字段与权限后重试');
        }
        return response.json();
        });
      }
      const idFrom=value=>{
        if(typeof value!=='string'||value.length>2000)fail(400,'Notion数据库链接或ID格式不正确');
        let raw=value.trim();
        if(raw.startsWith('https://')){let u;try{u=new URL(raw);}catch{fail(400,'Notion数据库链接不正确');}
          if(u.username||u.password||!(u.hostname==='notion.so'||u.hostname.endsWith('.notion.so')||u.hostname==='notion.site'||u.hostname.endsWith('.notion.site')))fail(400,'请使用Notion复制的数据库链接');
          raw=u.pathname.split('/').filter(Boolean).pop()||'';
        }
        const found=raw.match(/([a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i);
        if(!found)fail(400,'Notion数据库链接或ID格式不正确');return found[1];
      };
      if(!env.NOTION_DATA_SOURCE_ID){
        const databaseId=idFrom(env.NOTION_DATABASE_ID),cacheKey=await digest(env.NOTION_TOKEN)+':'+compact(databaseId),cached=dataSourceCache.get(cacheKey);
        if(cached&&cached.until>Date.now())env.NOTION_DATA_SOURCE_ID=cached.id;
        else{const database=await api('databases/'+databaseId);if(!Array.isArray(database.data_sources)||database.data_sources.length!==1)fail(400,'此数据库含多个数据源或没有数据源，请在Worker中明确设置NOTION_DATA_SOURCE_ID');
          env.NOTION_DATA_SOURCE_ID=idFrom(database.data_sources[0].id);if(dataSourceCache.size>100)dataSourceCache.clear();dataSourceCache.set(cacheKey,{id:env.NOTION_DATA_SOURCE_ID,until:Date.now()+3600000});}
      }else env.NOTION_DATA_SOURCE_ID=idFrom(env.NOTION_DATA_SOURCE_ID);
      if(path==='/setup/check'){
        const ds=await api('data_sources/'+env.NOTION_DATA_SOURCE_ID),expected={'标题':'title','日期':'date','记录人':'select','标签':'multi_select','日记ID':'rich_text','已删除':'checkbox','原始创建时间':'number'};
        const missing=Object.entries(expected).filter(([name,type])=>ds.properties?.[name]?.type!==type).map(([name,type])=>name+' ('+type+')');
        if(missing.length)fail(400,'数据库字段缺失或类型不符：'+missing.join('、'));
        return respond({ok:true,protocol:2,media:1,reliability:1,database:env.NOTION_DATA_SOURCE_ID,title:plain(ds.title)||'日记数据库'});
      }
      const validPage = id => { if (typeof id !== 'string' || !/^[a-f0-9-]{32,36}$/i.test(id)) fail(400, '无效页面ID'); };
      async function pageInDatabase(id) {
        validPage(id);
        const page = await api('pages/' + id);
        if (compact(page.parent?.data_source_id) !== compact(env.NOTION_DATA_SOURCE_ID)) fail(403, '页面不属于日记数据库');
        if (page.in_trash || page.archived) fail(409, '该日记已在Notion回收站，请先恢复');
        return page;
      }
      async function read(page) {
        const blocks = await api('blocks/' + page.id + '/children?page_size=100');
        const meta = metadata(page);
        let readOnly = blocks.has_more || blocks.results.length > 20;
        const photos = [], links = [], texts = [];
        for (const block of blocks.results) {
          if (block.has_children) readOnly = true;
          if (block.type === 'image') {
            const image = block.image, caption = plain(image.caption);
            const match = /^diary-image:([a-zA-Z0-9_-]{1,100})$/.exec(caption);
            const url = image.file?.url || image.external?.url;
            if (!safeLink(url) || (caption && !match)) readOnly = true;
            photos.push({ revision: safeLink(url) ? (image.type === 'external' ? url : new URL(url).origin + new URL(url).pathname) : '', id: match ? match[1] : 'notion-' + compact(block.id), blockId: block.id, pageId: page.id,
              url: safeLink(url) ? url : '', expiresAt: image.file?.expiry_time || null,
              externalUrl: image.type === 'external' && safeLink(url) ? url : undefined });
            continue;
          }
          if (block.type === 'bookmark') {
            if (!safeLink(block.bookmark.url) || plain(block.bookmark.caption)) readOnly = true;
            if (safeLink(block.bookmark.url)) links.push(block.bookmark.url);
            continue;
          }
          if (block.type !== 'paragraph') readOnly = true;
          const value = block[block.type];
          if (value?.color && value.color !== 'default') readOnly = true;
          const rs = value?.rich_text || [];
          if (rs.some(t => t.type !== 'text' || t.text?.link || Object.entries(t.annotations || {}).some(([k,v]) => k === 'color' ? v !== 'default' : v === true))) readOnly = true;
          texts.push(rs.length ? plain(rs) : (block.type === 'paragraph' ? '' : '[Notion内容：' + block.type + ']'));
        }
        const text = texts.join('\n');
        if (photos.length > 8 || links.length > 8 || new Set(photos.map(p=>p.id)).size !== photos.length) readOnly = true;
        if (text.length > MAX_TEXT) readOnly = true;
        // Detect edits during a read before assigning a baseline.
        const after = await pageInDatabase(page.id);
        if (after.last_edited_time !== page.last_edited_time) fail(409, 'Notion正在编辑这条日记，请稍后同步');
        return { ...meta, text, photos, links, pendingOperation:!!marker(page), readOnly, url: page.url, blocks: blocks.results };
      }
      async function upload(file) {
        if (!(file instanceof Blob) || !['image/jpeg','image/png','image/webp','image/gif'].includes(file.type) || !file.size || file.size > 2000000) fail(400, '图片须为JPEG/PNG/WebP/GIF，且不超过2MB');
        const created = await api('file_uploads', 'POST', { mode: 'single_part', filename: 'diary-image.' + ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'}[file.type]), content_type: file.type });
        const form = new FormData(); form.append('file', file, created.filename || 'diary-image.jpg');
        const sent = await api('file_uploads/' + created.id + '/send', 'POST', form);
        if (sent.status !== 'uploaded') fail(502, 'Notion尚未接收图片，请稍后重试');
        return { fileUploadId: sent.id, expiresAt: sent.expiry_time || new Date(Date.now()+40*60000).toISOString() };
      }
      if (path === '/upload') return respond(await upload(uploadFile));
      if (path === '/copy-upload') {
        const current = await read(await pageInDatabase(input.pageId));
        const photo = current.photos.find(p=>p.id === input.photoId);
        if (!photo || photo.externalUrl) fail(400, '未找到Notion托管图片');
        const u = new URL(photo.url);
        if (u.protocol !== 'https:' || !['.amazonaws.com','.notion.so','.notion-static.com','.notionusercontent.com'].some(domain => u.hostname.endsWith(domain))) fail(400, '图片地址不受支持');
        const blob = await timedFetch(u.href, { redirect: 'error' },30000,async response=>{
        if (!response.ok || Number(response.headers.get('Content-Length')) > 2000000) fail(400, '图片无法复制或超过2MB，请下载压缩后重新添加');
        // Bound the body even if upstream omits Content-Length.
        const reader = response.body.getReader(), chunks=[]; let size=0;
        while (true) { const {done,value}=await reader.read(); if(done)break;size+=value.length;if(size>2000000){await reader.cancel();fail(413,'图片超过2MB');}chunks.push(value); }
        return new Blob(chunks,{type:response.headers.get('Content-Type')?.split(';')[0]});
        });
        return respond(await upload(blob));
      }
      async function photoDownload(){
        const current=await read(await pageInDatabase(input.pageId)),photo=current.photos.find(p=>p.id===input.photoId);
        if(!photo)fail(404,'图片已被移除，请先同步');
        if(input.revision&&input.revision!==photo.revision)fail(409,'云端图片已改变，请先同步后再完整备份');
        const u=new URL(photo.url),extra=(env.ALLOWED_IMAGE_HOSTS||'').split(',').map(s=>s.trim()).filter(Boolean);
        const domains=['amazonaws.com','notion.so','notion-static.com','notionusercontent.com','sinaimg.cn','weibocdn.com','twimg.com','imgur.com','githubusercontent.com','unsplash.com',...extra];
        if(u.protocol!=='https:'||!domains.some(d=>u.hostname===d||u.hostname.endsWith('.'+d)))fail(400,'此外部图片来源暂不支持备份，请下载到本机后重新添加');
        return timedFetch(u.href,{redirect:'error'},30000,async response=>{
        if(!response.ok)fail(502,'图片下载失败，请稍后重试');
        const mime=response.headers.get('Content-Type')?.split(';')[0]||'';
        if(!['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif'].includes(mime))fail(400,'文件不是受支持的图片');
        const reader=response.body.getReader(),parts=[];let size=0;
        while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>20000000){await reader.cancel();fail(413,'单张原图超过20MB，请单独保存');}parts.push(value);}
        return new Response(new Blob(parts,{type:mime}),{headers:{...headers,'Content-Type':mime,'Access-Control-Expose-Headers':'X-Diary-Revision','X-Diary-Revision':encodeURIComponent(photo.revision)}});
        });
      }
      if(path==='/download')return await photoDownload();
      async function ensureSchema(){
        if((schemaReady.get(env.NOTION_DATA_SOURCE_ID)||0)>Date.now()-3600000)return;
        const ds=await api('data_sources/'+env.NOTION_DATA_SOURCE_ID);
        if(ds.properties['同步操作']&&ds.properties['同步操作'].type!=='rich_text')fail(400,'数据库的同步操作字段必须是文本类型');
        if(!ds.properties['同步操作'])await api('data_sources/'+env.NOTION_DATA_SOURCE_ID,'PATCH',{properties:{'同步操作':{rich_text:{}}}});
        schemaReady.set(env.NOTION_DATA_SOURCE_ID,Date.now());
      }
      async function fingerprint(block){
        if(block.type==='paragraph')return digest('paragraph:'+JSON.stringify(block.paragraph));
        if(block.type==='bookmark')return digest('bookmark:'+block.bookmark.url);
        if(block.type==='image'){const image=block.image,url=image.file?.url||image.external?.url||'',revision=safeLink(url)?(image.type==='external'?url:new URL(url).origin+new URL(url).pathname):'';return digest('image:'+JSON.stringify(image.caption)+':'+revision);}
        return digest(block.type+':'+block.id);
      }
      if (path === '/catalog') {
        const startedAt = new Date().toISOString();
        const query = { page_size: 100, sorts: [{ timestamp: 'last_edited_time', direction: 'ascending' }] };
        let since = null;
        if (input.since !== undefined && input.since !== null) {
          if (typeof input.since !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(input.since) || !Number.isFinite(Date.parse(input.since)) || Date.parse(input.since) > Date.now()) fail(400, '无效增量同步时间');
          since = new Date(input.since).toISOString();
          query.filter = { timestamp: 'last_edited_time', last_edited_time: { on_or_after: since } };
        }
        if (input.cursor) { if (typeof input.cursor !== 'string' || input.cursor.length > 100) fail(400, '无效游标'); query.start_cursor = input.cursor; }
        const result = await api('data_sources/' + env.NOTION_DATA_SOURCE_ID + '/query', 'POST', query);
        return respond({ protocol: 2, media: 1, reliability: 1, syncStartedAt: startedAt, since, database: env.NOTION_DATA_SOURCE_ID, entries: result.results.map(metadata), cursor: result.next_cursor, hasMore: result.has_more });
      }
      if (path === '/read') {
        const result = await read(await pageInDatabase(input.pageId));
        delete result.blocks;
        return respond(result);
      }
      if (path !== '/write') fail(404, '接口不存在；旧/add-entry已停用');
      if(!input.operationId||!/^[a-zA-Z0-9_-]{1,100}$/.test(input.operationId))fail(409,'请更新PWA到可靠性升级版本后再同步');
      await ensureSchema();
      validate(input.entry);
      attachments(input.entry);
      const entry = input.entry;
      let page;
      if (input.pageId) page = await pageInDatabase(input.pageId);
      else {
        // Idempotence after lost create response: stable diary ID, never blindly append.
        const found = await api('data_sources/' + env.NOTION_DATA_SOURCE_ID + '/query', 'POST', {
          filter: { property: '日记ID', rich_text: { equals: entry.id } }, page_size: 2 });
        if (found.results.length > 1) fail(409, 'Notion中存在重复日记ID，请先整理');
        page = found.results[0];
      }
      if (!page) {
        if (input.deleted) fail(409, '日记未同步过，不能远端删除');
        const created = await api('pages', 'POST', { parent: { type: 'data_source_id', data_source_id: env.NOTION_DATA_SOURCE_ID },
          properties: properties(entry), children: children(entry) });
        if ((entry.photos || []).length) { const complete = await read(created); delete complete.blocks; return respond(complete); }
        return respond({ ...metadata(created), text: entry.text, photos: (entry.photos || []).map(p=>({id:p.id})), links: entry.links || [], readOnly: false, url: created.url });
      }
      let current=await read(page);
      if(current.id!==entry.id)fail(409,'日记ID不匹配');
      let op=marker(page);
      const targetHash=await digest(signature({...entry,deleted:!!input.deleted}));
      if(op&&(op.id!==input.operationId||op.targetHash!==targetHash))fail(409,'另一设备有未完成同步，请回原设备重试以恢复');
      if(!op&&same(current,entry)&&current.deleted===!!input.deleted){delete current.blocks;return respond(current);}
      if(!op){
        const expected=input.baseHash|| (input.baseSignature?await digest(input.baseSignature):'');
        if(!input.baseVersion||input.baseVersion!==current.version||expected!==await digest(signature(current)))fail(409,'两端都有修改，请再次同步以保留冲突副本',{pageId:page.id});
        if(current.readOnly)fail(409,'含复杂格式或过长的Notion内容，请直接在Notion编辑');
        if(input.deleted){const updated=await api('pages/'+page.id,'PATCH',{properties:{'已删除':{checkbox:true}}});return respond({...metadata(updated),text:current.text,photos:current.photos,links:current.links,readOnly:false,url:updated.url});}
        op={id:input.operationId,targetHash,old:await Promise.all(current.blocks.map(async b=>({id:b.id,type:b.type,hash:await fingerprint(b)}))),textChanged:current.text!==entry.text,linksChanged:JSON.stringify(current.links)!==JSON.stringify(entry.links||[])};
        page=await api('pages/'+page.id,'PATCH',{properties:{'同步操作':{rich_text:rich(JSON.stringify(op))}}});
      }
      async function checkOperation(){
        const value=await read(await pageInDatabase(page.id));
        if(new Set(value.photos.map(p=>p.id)).size!==value.photos.length)fail(409,'发现重复图片，保留所有副本，请先检查Notion页面');
        const extras=value.blocks.filter(b=>!op.old.some(old=>old.id===b.id));
        for(const block of value.blocks){const old=op.old.find(o=>o.id===block.id);if(old&&old.hash!==await fingerprint(block))fail(409,'同步过程中Notion内容被改动，保留所有副本，请先检查页面');}
        const textExtras=extras.filter(b=>b.type==='paragraph');
        if(textExtras.length>1||textExtras.some(b=>plain(b.paragraph.rich_text)!==entry.text))fail(409,'同步恢复发现额外正文，请先检查Notion页面');
        for(const b of extras){if(b.type==='paragraph')continue;if(b.type==='image'&& (entry.photos||[]).some(p=>plain(b.image.caption)==='diary-image:'+p.id))continue;if(b.type==='bookmark'&&(entry.links||[]).includes(b.bookmark.url))continue;fail(409,'同步恢复发现未识别的内容，未执行清理');}
        return value;
      }
      current=await checkOperation();
      const desiredPhotos=entry.photos||[],desiredLinks=entry.links||[],oldIds=new Set(op.old.map(b=>b.id));
      const extra=[];
      if(op.textChanged&&!current.blocks.some(b=>!oldIds.has(b.id)&&b.type==='paragraph'&&plain(b.paragraph.rich_text)===entry.text))extra.push({object:'block',type:'paragraph',paragraph:{rich_text:rich(entry.text)}});
      for(const photo of desiredPhotos)if(!current.photos.some(p=>p.id===photo.id))extra.push(imageBlock(photo));
      if(op.linksChanged){for(const url of desiredLinks)if(!current.blocks.some(b=>!oldIds.has(b.id)&&b.type==='bookmark'&&b.bookmark.url===url))extra.push({object:'block',type:'bookmark',bookmark:{url}});}
      if(extra.length)await api('blocks/'+page.id+'/children','PATCH',{children:extra});
      current=await checkOperation();
      for(const block of current.blocks){
        if(!oldIds.has(block.id))continue;
        let remove=block.type==='paragraph'&&op.textChanged||block.type==='bookmark'&&op.linksChanged;
        if(block.type==='image'){const photo=current.photos.find(p=>p.blockId===block.id);remove=!desiredPhotos.some(p=>p.id===photo?.id);}
        if(remove)await api('blocks/'+block.id,'DELETE');
      }
      const updated = await api('pages/' + page.id, 'PATCH', { properties: {...properties(entry),'同步操作':{rich_text:[]}} });
      if (desiredPhotos.length) { const complete = await read(updated); delete complete.blocks; return respond(complete); }
      return respond({ ...metadata(updated), text: entry.text, photos: desiredPhotos.map(p=>current.photos.find(old=>old.id===p.id) || {id:p.id}), links: desiredLinks, readOnly: false, url: updated.url });
    } catch (error) { return respond({ error: error instanceof Failure ? error.message : '同步中断，请保留本机数据并稍后重试',...(error.details||{}) }, error.status || 500); }
  }
};
