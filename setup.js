// diary-release: 2026.10.29.3
(function(){
 'use strict';
 const dialog=document.getElementById('setup-dialog'),urlInput=document.getElementById('setup-worker'),secretInput=document.getElementById('setup-secret'),remember=document.getElementById('setup-remember'),status=document.getElementById('setup-status'),save=document.getElementById('setup-save'),check=document.getElementById('setup-check'),config=window.DiarySetupConfig;
 let verified=null,checking=false,dirty=false,generation=0,requestSequence=0;
 const banner=document.getElementById('setup-intro');banner.hidden=!!appSettings.syncUrl||DiaryStore.config('setupIntroDismissed',false);
 function publicURL(value,hosts){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&hosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h))?u:null;}catch{return null;}}
 const repo=publicURL(config.repository,['github.com']);const deploy=document.getElementById('setup-deploy');
 if(repo){deploy.href='https://deploy.workers.cloudflare.com/?url='+encodeURIComponent(repo.href.replace(/\/$/,'')+'/tree/'+encodeURIComponent(config.branch||'main')+'/worker');}else{deploy.removeAttribute('href');deploy.setAttribute('aria-disabled','true');}
 const template=publicURL(config.notionTemplateUrl,['notion.site','notion.so']),templateLink=document.getElementById('setup-template');
 if(template){templateLink.hidden=false;templateLink.href=template.href;document.getElementById('setup-template-pending').hidden=true;}else{templateLink.hidden=true;document.getElementById('setup-template-pending').textContent='公开空白模板尚未发布。可先按下方字段表创建数据库，已有日记库可直接继续。';}
 document.getElementById('setup-origin').textContent=location.origin;
 function open(){urlInput.value=appSettings.syncUrl||'';secretInput.value=document.getElementById('sync-secret').value||'';remember.checked=document.getElementById('remember-secret').checked;verified=null;dirty=false;save.disabled=true;status.textContent='检查只读取数据库结构，不上传或下载日记。';dialog.showModal();}
 for(const id of ['open-setup','intro-setup'])document.getElementById(id).onclick=open;
 document.getElementById('dismiss-setup-intro').onclick=async()=>{try{await DiaryStore.setConfig('setupIntroDismissed',true);banner.hidden=true;}catch(error){showToast(error.message);}};
 document.getElementById('setup-close').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{generation++;requestSequence++;verified=null;dirty=false;secretInput.value='';checking=false;check.disabled=false;});
 function invalidate(){generation++;verified=null;dirty=true;save.disabled=true;status.textContent='填写完成后，请点击检查连接。';}
 urlInput.addEventListener('input',invalidate);secretInput.addEventListener('input',invalidate);remember.addEventListener('change',()=>{dirty=true;});
 function endpoint(){const u=new URL(urlInput.value.trim());if(u.protocol!=='https:'||u.pathname!=='/'||u.username||u.password||u.search||u.hash)throw new Error('请填写HTTPS的Worker根地址，不含路径');return u.origin;}
 check.onclick=async()=>{
  if(checking)return;const token=++generation,request=++requestSequence;checking=true;check.disabled=true;save.disabled=true;verified=null;
  try{const url=endpoint(),secret=secretInput.value;if(!secret)throw new Error('请填写你在Cloudflare设置的连接码');status.textContent='正在检查Notion授权与数据库字段…';
   const result=await DiaryNet.request(url+'/setup/check',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+secret},body:'{}'},45000);
   if(token!==generation||!dialog.open)return;
   if(!result.ok||result.protocol!==2||result.media!==1||result.reliability!==1||typeof result.database!=='string')throw new Error('Worker响应不兼容，请更新部署的Worker');
   verified={url,secret};save.disabled=false;status.textContent='已连接「'+(result.title||'日记数据库')+'」，字段检查通过。保存后由你手动点击同步。';
  }catch(error){if(token===generation)status.textContent=error.status===404?'当前Worker还没有连接检查接口，请先部署新版Worker。原有手动同步不受影响。':'检查未完成：'+error.message;}
  finally{if(request===requestSequence){checking=false;check.disabled=false;}}
 };
 save.onclick=async()=>{
  if(!verified||verified.url!==endpoint()||verified.secret!==secretInput.value){invalidate();return;}
  save.disabled=true;const connection={...verified},remembered=remember.checked;
  try{await DiaryStore.configureSync(connection.url,connection.secret,remembered);try{sessionStorage.setItem('diary_sync_secret',connection.secret);}catch(_){}
   appSettings=loadSettings();document.getElementById('sync-url').value=appSettings.syncUrl;document.getElementById('sync-secret').value=connection.secret;document.getElementById('remember-secret').checked=remembered;
   banner.hidden=true;dirty=false;dialog.close();await refreshSyncStatus();showToast('连接已保存；日记仍由你手动点击同步');
  }catch(error){status.textContent='保存未完成：'+error.message;save.disabled=false;}
 };
 window.DiarySetup={hasUnsaved:()=>dialog.open&&(dirty||checking)};
})();
