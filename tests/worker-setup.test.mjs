import test from 'node:test';import assert from 'node:assert/strict';import worker from '../worker/index.mjs';
const DB='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',DS='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const types={'标题':'title','日期':'date','记录人':'select','标签':'multi_select','日记ID':'rich_text','已删除':'checkbox','原始创建时间':'number'};
test('Setup checks authorize, resolve database links once, validate fields and never write diary content',async()=>{
 const fetch=globalThis.fetch,timer=globalThis.setTimeout,calls=[];let multi=false,badSchema=false;
 globalThis.setTimeout=(f,ms)=>ms===400?(f(),0):timer(f,ms);
 globalThis.fetch=async(url,options)=>{calls.push([url,options]);assert.equal(options.method,'GET');assert.equal(options.headers.Authorization,'Bearer notion-token');let result;
  if(url.includes('/databases/'))result={data_sources:multi?[{id:DS},{id:DB}]:[{id:DS}]};
  else result={title:[{plain_text:'自己的日记'}],properties:Object.fromEntries(Object.entries(types).map(([name,type])=>[name,{type:badSchema&&name==='标签'?'rich_text':type}]))};
  return new Response(JSON.stringify(result));};
 const env={NOTION_TOKEN:'notion-token',WORKER_SECRET:'own-secret',ALLOWED_ORIGIN:'https://diary.test',NOTION_DATABASE_ID:'https://www.notion.so/My-diary-'+DB.replaceAll('-','')+'?v=cccccccccccccccccccccccccccccccc'};
 async function call(settings=env,headers={}){const response=await worker.fetch(new Request('https://worker.test/setup/check',{method:'POST',headers:{Origin:env.ALLOWED_ORIGIN,Authorization:'Bearer own-secret','Content-Type':'application/json',...headers},body:'{}'}),settings);return{status:response.status,data:await response.json()};}
 try{
  let r=await call();assert.equal(r.status,200);assert.equal(r.data.database,DS);assert.equal(r.data.title,'自己的日记');assert.equal(calls.length,2);assert.equal(env.NOTION_DATA_SOURCE_ID,undefined,'shared bindings are never mutated');assert.equal(r.data.reliability,1);
  await call();assert.equal(calls.length,3,'warm Worker reuses the database resolution, but checks current schema');assert.equal(calls.filter(([url])=>url.includes('/databases/')).length,1);
  let count=calls.length;assert.equal((await call(env,{Authorization:'Bearer wrong'})).status,401);assert.equal((await call(env,{Origin:'https://evil.test'})).status,403);assert.equal(calls.length,count);
  assert.equal((await call({...env,NOTION_DATABASE_ID:'https://evil.test/'+DB})).status,400);assert.equal(calls.length,count);
  badSchema=true;r=await call();assert.equal(r.status,400);assert.match(r.data.error,/标签/);badSchema=false;
  multi=true;r=await call({...env,NOTION_DATABASE_ID:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'});assert.equal(r.status,400);assert.match(r.data.error,/多个数据源/);multi=false;
  count=calls.length;r=await call({...env,NOTION_DATA_SOURCE_ID:DS,NOTION_DATABASE_ID:'unused-invalid-link'});assert.equal(r.status,200);assert.equal(calls.length-count,1,'existing direct data source configuration remains supported');
  assert.ok(calls.every(([,opts])=>opts.method==='GET'));console.log('PASS: setup auth/CORS, Notion link resolution/cache, explicit data-source compatibility, schema checks and zero Notion writes.');
 }finally{globalThis.fetch=fetch;globalThis.setTimeout=timer;}
});
