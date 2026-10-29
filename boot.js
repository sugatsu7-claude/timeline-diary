// diary-release: 2026.10.29.1
(async function(){
 const status=document.getElementById('boot-status'),base=new URL('./',location.href);
 try{
  await DiaryStore.ready();
  await DiaryStore.purgeExpired();
  for(const file of ['app.js','authors.js','media.js','cards.js','sync.js','archive.js','backup.js','setup-config.js','setup.js','updates.js']){await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL(file,base);script.onload=resolve;script.onerror=()=>reject(new Error('应用文件未完整加载：'+file));document.body.appendChild(script);});if(file==='sync.js')await syncReady;}

  status.hidden=true;window.diaryReady=true;
 }catch(error){status.replaceChildren();const message=document.createElement('p');message.textContent='本机数据读取未完成：'+error.message+'。旧数据没有被清除。';const retry=document.createElement('button');retry.textContent='重试';retry.onclick=()=>location.reload();const exportButton=document.createElement('button');exportButton.textContent='导出旧数据供恢复';exportButton.onclick=()=>{const data={};for(const key of ['penang_timeline_diary','penang_timeline_trash','penang_timeline_tags'])data[key]=localStorage.getItem(key);const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='diary-legacy-recovery.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};status.append(message,retry,exportButton);}
})();
