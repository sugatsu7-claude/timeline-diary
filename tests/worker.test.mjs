import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.mjs';
const DS = '11111111-1111-4111-8111-111111111111';
const PID = '22222222-2222-4222-8222-222222222222';
const env = { WORKER_SECRET: 'test-secret', NOTION_TOKEN: 'notion-secret', NOTION_DATA_SOURCE_ID: DS, ALLOWED_ORIGIN: 'https://diary.test' };
const entry = { id: 'entry1', date: '2026-10-26', text: '五月的日记\n第二行', source: '叙', tags: ['日常'] };
const sig = e => {const f=[e.date,e.text,e.source,e.tags.slice().sort()];if((e.photos||[]).length||(e.links||[]).length)f.push((e.photos||[]).map(p=>[p.id,p.revision||'']),e.links||[]);return JSON.stringify(f)};
const rt = s => [{ type: 'text', text: { content: s }, plain_text: s }];
function fixture() {
 let page = null, blocks = [], calls = [], n = 0;
 const stamp = () => '2026-10-26T01:00:' + String(++n).padStart(2, '0') + '.000Z';
 function touch() { page.last_edited_time = stamp(); }
 return { calls, get page() { return page; }, get blocks() { return blocks; },
  seed(complex = false, otherDB = false) {
   page = { id: PID, parent: { data_source_id: otherDB ? 'other' : DS }, last_edited_time: stamp(), created_time: '2026-10-26T00:00:00Z', url: 'https://www.notion.so/' + PID,
    properties: { '日记ID': { rich_text: rt(entry.id) }, '日期': { date: { start: entry.date } }, '记录人': { select: { name: entry.source } }, '标题': { title: rt('Title') }, '标签': { multi_select: [{name:'日常'}] }, '已删除': { checkbox: false } } };
   blocks = [{ id: 'old-block', type: complex ? 'heading_1' : 'paragraph', [complex ? 'heading_1' : 'paragraph']: { rich_text: rt(entry.text) } }];
  },
  async fetch(url, options = {}) {
   assert.equal(options.headers.Authorization, 'Bearer notion-secret');
   assert.equal(options.headers['Notion-Version'], '2025-09-03');
   const path = new URL(url).pathname.replace('/v1/', ''), method = options.method || 'GET';
   const body = options.body ? JSON.parse(options.body) : {};
   calls.push([method,path,body]);
   let out;
   if (path==='data_sources/'+DS) out={properties:{'同步操作':{type:'rich_text'}}};
   else if (path.endsWith('/query')) out = { results: page ? [page] : [], has_more: false, next_cursor: null };
   else if (path === 'pages' && method === 'POST') {
    this.seed(); page.properties = body.properties; blocks = body.children.map((b,i)=>({...b,id:'new'+i})); out = page;
   } else if (path === 'pages/' + PID) {
    if(method === 'PATCH') { Object.assign(page.properties, body.properties); touch(); }
    out = page;
   } else if(path === 'blocks/' + PID + '/children') {
    if(method === 'PATCH') { blocks.push(...body.children.map((b,i)=>({...b,id:'append'+n+i}))); touch(); out = {}; }
    else out = {results:blocks,has_more:false};
   } else if(method === 'DELETE') { blocks = blocks.filter(b=>path!=='blocks/'+b.id); touch(); out = {}; }
   else throw Error('Unhandled '+method+' '+path);
   return new Response(JSON.stringify(out));
  }
 };
}
async function request(path, body = {}, config = {}) {
 if(path==='/write'&&!body.operationId)body={...body,operationId:crypto.randomUUID()};
 const headers = {Origin: env.ALLOWED_ORIGIN, Authorization: 'Bearer test-secret','Content-Type':'application/json',...config.headers};
 const response = await worker.fetch(new Request('https://worker.test'+path,{method:config.method || 'POST',headers,body:config.method==='OPTIONS'?undefined:JSON.stringify(body)}), config.env || env);
 return { status:response.status, headers:response.headers, data:response.status===204?null:await response.json() };
}
// Serial tests replace globals only inside one test, restore even on failure.
test('Worker authorization, isolation, conflict, safe content and deletion', async()=>{
 const originalFetch=globalThis.fetch, originalTimer=globalThis.setTimeout;
 let f=fixture(); globalThis.fetch=(...args)=>f.fetch(...args); globalThis.setTimeout=(fn,ms)=>ms===400?(fn(),0):originalTimer(fn,ms);
 try {
  assert.equal((await request('/catalog',{}, {headers:{Authorization:'Bearer wrong'}})).status,401);
  assert.equal((await request('/catalog',{}, {headers:{Origin:'https://evil.test'}})).status,403);
  assert.equal((await request('/catalog',{}, {env:{...env,WORKER_SECRET:''}})).status,503);
  assert.equal(f.calls.length,0);
  assert.equal((await request('/catalog',{}, {method:'OPTIONS'})).status,204);
  const since='2026-01-01T00:00:00.000Z';
  const delta=await request('/catalog',{since,cursor:'next-page'});
  assert.equal(delta.data.protocol,2);assert.equal(delta.data.since,since);
  const query=f.calls.at(-1)[2];
  assert.deepEqual(query.filter,{timestamp:'last_edited_time',last_edited_time:{on_or_after:since}});
  assert.equal(query.start_cursor,'next-page');
  assert.deepEqual(query.sorts,[{timestamp:'last_edited_time',direction:'ascending'}]);
  assert.equal((await request('/catalog',{since:'not-a-date'})).status,400);
  const full=await request('/catalog',{});assert.equal(full.data.since,null);assert.equal(f.calls.at(-1)[2].filter,undefined);
  let created=await request('/write',{entry}); assert.equal(created.status,200); assert.equal(created.data.source,'叙');
  assert.equal((await request('/write',{entry})).status,200);
  assert.equal(f.calls.filter(([m,p])=>m==='POST'&&p==='pages').length,1,'lost create response must not duplicate');
  assert.equal((await request('/write',{entry:{...entry,text:'New'},pageId:PID,baseVersion:'stale'})).status,409);
  assert.equal((await request('/write',{entry:{...entry,text:'New'},pageId:PID,baseVersion:f.page.last_edited_time,baseSignature:'outdated-body'})).status,409);
  let read=await request('/read',{pageId:PID}); assert.equal(read.data.text,entry.text);
  let updated=await request('/write',{entry:{...entry,text:'New'},pageId:PID,baseVersion:read.data.version,baseSignature:sig(entry)}); assert.equal(updated.status,200,JSON.stringify(updated.data));
  assert.equal(f.blocks.length,1); assert.equal(f.blocks[0].paragraph.rich_text[0].text.content,'New');
  let removed=await request('/write',{entry:{...entry,text:'New'},pageId:PID,baseVersion:updated.data.version,baseSignature:sig({...entry,text:'New'}),deleted:true});
  assert.equal(removed.data.deleted,true); assert.equal(f.blocks.length,1,'soft delete retains text');
  f.seed(true); read=await request('/read',{pageId:PID}); assert.equal(read.data.readOnly,true);
  assert.equal((await request('/write',{entry:{...entry,text:'New'},pageId:PID,baseVersion:read.data.version,baseSignature:sig(entry)})).status,409);
  f.seed();
  f.blocks.push({id:'image-block',type:'image',image:{type:'file',file:{url:'https://prod-files-secure.s3.us-west-2.amazonaws.com/photo.jpg',expiry_time:'2030-01-01T00:00:00Z'},caption:rt('diary-image:photo1')}});
  f.blocks.push({id:'link-block',type:'bookmark',bookmark:{url:'https://weibo.com/example',caption:[]}});
  let media=await request('/read',{pageId:PID});
  assert.equal(media.data.readOnly,false);assert.equal(media.data.text,entry.text);assert.equal(media.data.photos[0].id,'photo1');assert.deepEqual(media.data.links,['https://weibo.com/example']);
  f.blocks.find(b=>b.id==='image-block').image.file.url='https://prod-files-secure.s3.us-west-2.amazonaws.com/replaced.jpg';
  const replaceConflict=await request('/write',{entry:{...entry,photos:[],links:media.data.links},pageId:PID,baseVersion:media.data.version,baseSignature:sig(media.data)});
  assert.equal(replaceConflict.status,409,'same-timestamp image replacement must conflict before removal');
  f.blocks.find(b=>b.id==='image-block').image.file.url='https://prod-files-secure.s3.us-west-2.amazonaws.com/photo.jpg';
  let mediaEntry={...entry,text:'Edit text with attachments',photos:media.data.photos,links:media.data.links};
  let mediaWrite=await request('/write',{entry:mediaEntry,pageId:PID,baseVersion:media.data.version,baseSignature:sig(media.data)});
  assert.equal(mediaWrite.status,200);assert.ok(f.blocks.some(b=>b.id==='image-block'),'text edits must preserve image blocks');assert.ok(f.blocks.some(b=>b.id==='link-block'));
  let remove=await request('/write',{entry:{...mediaEntry,photos:[]},pageId:PID,baseVersion:mediaWrite.data.version,baseSignature:sig(mediaWrite.data)});
  assert.equal(remove.status,200);assert.ok(!f.blocks.some(b=>b.id==='image-block'));
  assert.equal((await request('/write',{entry:{...entry,links:['javascript:alert(1)']}})).status,400);
  f.seed(false,true); assert.equal((await request('/read',{pageId:PID})).status,403);
  f.seed();
  const originalFixtureFetch=globalThis.fetch;let failDelete=true;
  globalThis.fetch=async(url,options)=>{if(options.method==='DELETE'&&failDelete){failDelete=false;return new Response('{}',{status:500});}return originalFixtureFetch(url,options)};
  const beforeRecovery=await request('/read',{pageId:PID}), recoveryBody={entry:{...entry,text:'Recovered text'},pageId:PID,baseVersion:beforeRecovery.data.version,baseSignature:sig(entry),operationId:'recover-fixed'};
  assert.equal((await request('/write',recoveryBody)).status,502);assert.ok(f.page.properties['同步操作'].rich_text.length>0);
  assert.equal((await request('/write',recoveryBody)).status,200);
  assert.equal(f.blocks.length,1);assert.equal(f.blocks[0].paragraph.rich_text[0].text.content,'Recovered text');
  assert.deepEqual(f.page.properties['同步操作'].rich_text,[]);
  const uploadCalls=[];
  globalThis.fetch=async(url,options)=>{
    uploadCalls.push(url);
    if(url.endsWith('/file_uploads')){assert.equal(JSON.parse(options.body).mode,'single_part');return new Response(JSON.stringify({id:PID,filename:'diary-image.jpg'}));}
    assert.ok(options.body instanceof FormData);assert.equal(options.headers['Content-Type'],undefined);
    assert.equal(options.body.get('file').type,'image/jpeg');return new Response(JSON.stringify({id:PID,status:'uploaded'}));
  };
  const form=new FormData();form.append('file',new Blob([new Uint8Array([255,216,255,217])],{type:'image/jpeg'}),'photo.jpg');
  const uploaded=await worker.fetch(new Request('https://worker.test/upload',{method:'POST',headers:{Authorization:'Bearer test-secret',Origin:env.ALLOWED_ORIGIN},body:form}),env);
  assert.equal(uploaded.status,200);assert.equal((await uploaded.json()).fileUploadId,PID);assert.equal(uploadCalls.length,2);
  // A response that sends headers but never finishes JSON must still time out.
  globalThis.setTimeout=(fn,ms)=>ms===400?(fn(),0):originalTimer(fn,10);
  globalThis.fetch=async()=>({ok:true,json:()=>new Promise(()=>{})});
  assert.equal((await request('/catalog')).status,504,'body decoding is covered by the deadline');
  // The same deadline covers a stalled remote image body during explicit full backup.
  f.seed();f.blocks.push({id:'photo-block',type:'image',image:{type:'file',file:{url:'https://prod-files-secure.s3.us-west-2.amazonaws.com/photo.jpg',expiry_time:'2030-01-01T00:00:00Z'},caption:rt('diary-image:photo-one')}});
  globalThis.fetch=async(url,options)=>String(url).startsWith('https://api.notion.com/')?f.fetch(url,options):new Response(new ReadableStream({start(){}}),{headers:{'Content-Type':'image/jpeg'}});
  assert.equal((await request('/download',{pageId:PID,photoId:'photo-one',revision:'https://prod-files-secure.s3.us-west-2.amazonaws.com/photo.jpg'})).status,504,'image stream is covered by the deadline');
  console.log('No live Notion data was accessed.');
 } finally { globalThis.fetch=originalFetch;globalThis.setTimeout=originalTimer; }
});
