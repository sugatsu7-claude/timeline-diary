// diary-release: 2026.10.26.11
(function(){'use strict';
 async function request(url,options={},timeout=30000,type='json'){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{const response=await fetch(url,{...options,signal:controller.signal,cache:'no-store'});let body;if(type==='blob'){if(!response.ok){let error;try{error=(await response.json()).error;}catch(_){}throw Object.assign(new Error(error||'下载失败（'+response.status+'）'),{status:response.status});}body=await response.blob();}else{try{body=await response.json();}catch(e){if(controller.signal.aborted)throw e;throw new Error('服务响应格式有误，请确认Worker已更新');}if(!response.ok)throw Object.assign(new Error(body.error||'请求失败（'+response.status+'）'),{status:response.status,response:body});}return body;}
  catch(e){if(controller.signal.aborted)throw new Error('请求超时；已完成的操作已保留，请稍后重试。写入是否完成会在下次同步核对');throw e;}
  finally{clearTimeout(timer);}
 }
 function credentials(){const input=document.getElementById('sync-secret'),url=new URL(window.appSettings?.syncUrl||'');if(url.protocol!=='https:'||url.pathname!=='/'||url.username||url.password||url.search||url.hash||!input?.value)throw new Error('请先配置Worker地址和同步口令');return{url:url.origin,headers:{Authorization:'Bearer '+input.value}};}
 window.DiaryNet={request,credentials};
})();
