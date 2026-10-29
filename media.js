// diary-release: 2026.10.29.2
/* Local blobs live in IndexedDB; metadata alone lives with diary entries. */
(function () {
  'use strict';
  var dbPromise, bgObjectUrl, viewerUrls = [], viewerEntry;
  function database() {
    if(!dbPromise)dbPromise=new Promise(function(resolve,reject){
      var r=indexedDB.open('timeline-diary-assets',2);
      r.onupgradeneeded=function(){var db=r.result;if(!db.objectStoreNames.contains('assets'))db.createObjectStore('assets');if(!db.objectStoreNames.contains('assetMeta'))db.createObjectStore('assetMeta');};
      r.onerror=function(){reject(new Error('无法访问本机图片存储'));};
      r.onblocked=function(){reject(new Error('请关闭其他旧版日记窗口，再重新打开以完成图片存储升级'));};
      r.onsuccess=function(){var db=r.result;db.onversionchange=function(){db.close();};var tx=db.transaction(['assets','assetMeta'],'readwrite'),cursor=tx.objectStore('assets').openCursor();cursor.onsuccess=function(){var c=cursor.result;if(!c)return;var old=tx.objectStore('assetMeta').get(c.key);old.onsuccess=function(){if(!old.result)tx.objectStore('assetMeta').put({touchedAt:Date.now()},c.key);c.continue();};};tx.oncomplete=function(){resolve(db);};tx.onerror=function(){reject(tx.error);};};
    });return dbPromise;
  }
  async function store(method,key,value){
    var db=await database();return new Promise(function(resolve,reject){
      var tx=db.transaction(method==='get'?['assets']:['assets','assetMeta'],method==='get'?'readonly':'readwrite'),object=tx.objectStore('assets'),r=method==='put'?object.put(value,key):object[method](key);
      if(method==='put')tx.objectStore('assetMeta').put({touchedAt:Date.now()},key);if(method==='delete')tx.objectStore('assetMeta').delete(key);
      tx.oncomplete=function(){resolve(r.result);};tx.onerror=tx.onabort=function(){reject(new Error('图片存储未完成，请检查本机空间'));};
    });
  }
  async function assetInfo(){var db=await database();return new Promise(function(resolve,reject){var tx=db.transaction(['assets','assetMeta']),r=tx.objectStore('assets').openCursor(),items=[];r.onsuccess=function(){var c=r.result;if(!c)return;var m=tx.objectStore('assetMeta').get(c.key);m.onsuccess=function(){items.push({key:c.key,bytes:c.value instanceof Blob?c.value.size:0,upload:String(c.key).startsWith('upload:'),expiresAt:c.value?.expiresAt,touchedAt:m.result?.touchedAt||Date.now()});c.continue();};};tx.oncomplete=function(){resolve(items);};tx.onerror=function(){reject(tx.error);};});}
  async function cleanupAssets(protectedKeys){var db=await database(),removed=0,bytes=0;await new Promise(function(resolve,reject){var tx=db.transaction(['assets','assetMeta'],'readwrite'),r=tx.objectStore('assets').openCursor();r.onsuccess=function(){var c=r.result;if(!c)return;var key=c.key,m=tx.objectStore('assetMeta').get(key);m.onsuccess=function(){var expired=String(key).startsWith('upload:')&&Date.parse(c.value?.expiresAt)<Date.now(),old=(m.result?.touchedAt||Date.now())<Date.now()-7*86400000;if(key!=='background'&&!protectedKeys.has(key)&&(expired||old)){bytes+=c.value instanceof Blob?c.value.size:0;removed++;c.delete();tx.objectStore('assetMeta').delete(key);}c.continue();};};tx.oncomplete=resolve;tx.onerror=tx.onabort=function(){reject(tx.error);};});return{removed,bytes};}
  function safeLink(text) { try { var u = new URL(text); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password && text.length <= 2000; } catch (_) { return false; } }
  function links() {
    var result = Array.from(new Set(document.getElementById('entry-links').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean)));
    if (result.length > 8 || result.some(function (u) { return !safeLink(u); })) throw new Error('每行一个HTTP/HTTPS链接，最多8个');
    return result;
  }
  async function hash(blob) {
    var digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  async function compress(file, maxSide) {
    if (!file.type.startsWith('image/') || file.size > 25000000) throw new Error('请选择25MB以内的图片');
    var source = URL.createObjectURL(file), image = new Image();
    try {
      await new Promise(function (resolve, reject) { image.onload = resolve; image.onerror = function () { reject(new Error('无法读取图片，请尝试JPEG或PNG')); }; image.src = source; });
      var scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      var ctx = canvas.getContext('2d');ctx.fillStyle = '#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
      var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', 0.82); });
      if (!blob || blob.size > 2000000) throw new Error('压缩后仍超过2MB，请选择较小的图片');
      return blob;
    } finally { URL.revokeObjectURL(source); }
  }
  function draftEvent() { document.getElementById('sheet').dispatchEvent(new Event('change')); }
  function renderSheet() {
    var wrap = document.getElementById('sheet-photos');wrap.replaceChildren();
    sheetPhotos.forEach(function (photo, i) {
      var group = document.createElement('span'), view = document.createElement('button'), remove = document.createElement('button');
      view.type = remove.type = 'button';view.append(icon('photo'),document.createTextNode(String(i+1)));view.onclick = function () { openPhotos({id:editingId,photos:sheetPhotos}, i); };
      remove.textContent = '移除';remove.setAttribute('aria-label','移除图片'+(i+1));remove.onclick = function () { sheetPhotos.splice(i,1);renderSheet();draftEvent(); };
      group.append(view,remove);wrap.appendChild(group);
    });
  }
  document.getElementById('entry-photos').onchange = async function (event) {
    if (mediaBusy) { showToast('图片处理中，请稍候');return; }
    var files = Array.from(event.target.files);event.target.value = '';
    if (files.length + sheetPhotos.length > 8) { showToast('每条日记最多8张图片');return; }
    mediaBusy = true;document.getElementById('entry-photos').disabled = true;document.getElementById('sheet-save').disabled = true;
    document.getElementById('photo-status').textContent = '正在压缩并保存到本机…';
    try {
      for (var file of files) {
        var blob = await compress(file,1600), id = await hash(blob);
        await store('put',id,blob);
        if (!sheetPhotos.some(function (p) { return p.id === id; })) sheetPhotos.push({id:id,name:file.name});
      }
      renderSheet();draftEvent();document.getElementById('photo-status').textContent = '图片已存本机，点击同步后才上传Notion。';
    } catch (error) { renderSheet();draftEvent();showToast(error.message);document.getElementById('photo-status').textContent = error.message; }
    finally { mediaBusy = false;document.getElementById('entry-photos').disabled = false;document.getElementById('sheet-save').disabled = false; }
  };
  var rawBackground = applyBackground;
  applyBackground = async function (url) {
    if (bgObjectUrl) { URL.revokeObjectURL(bgObjectUrl);bgObjectUrl = null; }
    if (appSettings.localBackground) {
      try { var blob = await store('get','background'); if (blob) { bgObjectUrl = URL.createObjectURL(blob);rawBackground(bgObjectUrl);document.getElementById('background-status').textContent = '正在使用本机图片，不会上传。';return; } }
      catch (_) { showToast('本机背景读取失败'); }
    }
    rawBackground(url);
  };
  document.getElementById('local-background').onchange = async function (event) {
    var file = event.target.files[0];event.target.value = '';if (!file) return;
    if(mediaBusy){showToast('图片处理中，请稍候');return;}
    mediaBusy = true;
    try { var blob = await compress(file,2000);await store('put','background',blob);var next={...appSettings,localBackground:true};await DiaryStore.setConfig(SETTINGS_KEY,next);appSettings=next;await applyBackground(appSettings.bgUrl);showToast('本机背景已应用'); }
    catch(error) { showToast(error.message); } finally { mediaBusy=false; }
  };
  document.getElementById('use-bg-url').onclick = async function () {
    var url = document.getElementById('bg-url').value.trim();
    if (url && !safeLink(url)) { showToast('请输入HTTP/HTTPS图片地址');return; }
    var next={...appSettings,bgUrl:url,localBackground:false};
    try {await DiaryStore.setConfig(SETTINGS_KEY,next);appSettings=next;applyBackground(url);document.getElementById('background-status').textContent='使用网址背景；外部图片需要联网。';}catch(_){showToast('设置未保存');}
  };
  document.getElementById('reset-background').onclick = async function () {
    try {var next={...appSettings,localBackground:false,bgUrl:''};await DiaryStore.setConfig(SETTINGS_KEY,next);appSettings=next;document.getElementById('bg-url').value='';applyBackground('');document.getElementById('background-status').textContent='已恢复默认背景。';}catch(_){showToast('恢复默认背景失败');}
  };
  applyBackground(appSettings.bgUrl);

  function credentials(){var c=DiaryNet.credentials();return{endpoint:c.url,headers:c.headers};}
  async function refreshPhotos(entry) {
    var c = credentials();
    var pageId=entry.photos.find(function(p){return p.pageId;})?.pageId;
    var value=await DiaryNet.request(c.endpoint+'/read',{method:'POST',headers:{...c.headers,'Content-Type':'application/json'},body:JSON.stringify({pageId:pageId})},30000);
    if(value.pageId!==pageId)throw new Error('图片所属页面不匹配，请先同步');
    var mapping=new Map((value.photos||[]).map(p=>[p.id,p]));
    if(entry.id)await DiaryStore.patchPhotos(entry.id,value.photos||[]);
    (entry.photos||[]).forEach(function(p){if(mapping.has(p.id))Object.assign(p,mapping.get(p.id));});
  }
  async function openPhotos(entry, selected) {
    var dialog=document.getElementById('photo-viewer'), slides=document.getElementById('photo-slides');
    if(dialog.open)dialog.close();viewerUrls.forEach(URL.revokeObjectURL);viewerUrls=[];viewerEntry=entry;slides.replaceChildren();
    (entry.photos||[]).forEach(function(photo,i){var section=document.createElement('section'),note=document.createElement('p');section.className='photo-slide';section.dataset.index=i;note.textContent='点击或滑动查看';section.append(note);slides.append(section);});
    dialog.showModal();slides.scrollLeft=0;
    await new Promise(requestAnimationFrame);slides.scrollTo({left:slides.clientWidth*(selected||0),behavior:'instant'});updateCounter();await loadVisible();
  }
  var refreshing;
  async function loadVisible() {
    var slides=document.getElementById('photo-slides'), index=Math.round(slides.scrollLeft/Math.max(1,slides.clientWidth));
    var section=slides.children[index],photo=viewerEntry?.photos[index];
    if(!section||!photo||section.dataset.loaded)return;section.dataset.loaded='true';
    var note=section.querySelector('p');note.textContent='读取图片…';
    try {
      var blob=photo.revision&&photo.localRevision!==photo.revision?null:await store('get',photo.cacheKey||photo.id),src;
      if(blob){src=URL.createObjectURL(blob);viewerUrls.push(src);}
      else {
        if (!photo.url || (photo.expiresAt && Date.parse(photo.expiresAt)<Date.now()+30000)) {
          if(!navigator.onLine)throw new Error('此图片尚未存本机，请联网后查看');
          if(!refreshing)refreshing=refreshPhotos(viewerEntry).finally(function(){refreshing=null;});await refreshing;
        }
        if(!safeLink(photo.url))throw new Error('图片暂不可用，请先同步');src=photo.url;
      }
      section.querySelectorAll('img').forEach(function(img){img.remove();});
      var image=document.createElement('img');image.alt='日记图片 '+(index+1);image.onload=function(){note.remove();};image.onerror=function(){note.textContent='图片加载失败，请联网后关闭重试或同步。';section.dataset.loaded='';};image.src=src;section.appendChild(image);
    }catch(error){note.textContent=error.message;section.dataset.loaded='';}
  }
  function updateCounter(){
    var slides=document.getElementById('photo-slides'),count=viewerEntry?.photos.length||0,index=Math.round(slides.scrollLeft/Math.max(1,slides.clientWidth));
    document.getElementById('photo-counter').textContent=(index+1)+' / '+count;
    document.getElementById('photo-prev').hidden=document.getElementById('photo-next').hidden=count<=1;
    document.getElementById('photo-prev').disabled=index<=0;document.getElementById('photo-next').disabled=index>=count-1;
    document.getElementById('photo-hint').textContent=count>1?'左右滑动查看':'轻点窗口外可关闭';
  }
  document.getElementById('photo-slides').onscroll=function(){updateCounter();loadVisible();};
  ['prev','next'].forEach(function(direction){document.getElementById('photo-'+direction).onclick=function(){var slides=document.getElementById('photo-slides');slides.scrollBy({left:slides.clientWidth*(direction==='next'?1:-1),behavior:'smooth'});};});
  document.getElementById('photo-close').onclick=function(){document.getElementById('photo-viewer').close();};
  document.getElementById('photo-viewer').onclose=function(){viewerUrls.forEach(URL.revokeObjectURL);viewerUrls=[];viewerEntry=null;};
  document.getElementById('link-close').onclick=function(){document.getElementById('link-viewer').close();};
  function icon(kind){ return actionIcon(kind); }
  ['photo-viewer','link-viewer'].forEach(function(id){document.getElementById(id).addEventListener('click',function(event){if(event.target!==this)return;var r=this.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)this.close();});});
  function decorate(card,entry){
    if(!(entry.photos||[]).length&&!(entry.links||[]).length)return;
    var row=document.createElement('div');row.className='attachment-row';
    if((entry.photos||[]).length){var b=document.createElement('button');b.className='entry-delete';b.append(icon('photo'));b.setAttribute('aria-label','查看日记图片');b.onclick=function(){openPhotos(entry,0);};row.appendChild(b);}
    if((entry.links||[]).length){var b=document.createElement('button');b.className='entry-delete';b.append(icon('link'));b.setAttribute('aria-label','查看日记链接');b.onclick=function(){
      var wrap=document.getElementById('entry-link-list');wrap.replaceChildren();entry.links.filter(safeLink).forEach(function(url){
        var parsed=new URL(url),link=document.createElement('a'),info=document.createElement('span'),domain=document.createElement('span'),path=document.createElement('span'),arrow=document.createElement('span');
        link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.className='diary-link';link.title=url;link.setAttribute('aria-label','打开链接 '+url);
        info.className='diary-link-info';domain.className='diary-link-domain';path.className='diary-link-path';domain.textContent=parsed.hostname.replace(/^www\./,'');path.textContent=parsed.pathname+parsed.search+parsed.hash;arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');info.append(domain,path);link.append(icon('link'),info,arrow);wrap.appendChild(link);
      });document.getElementById('link-viewer').showModal();
    };row.appendChild(b);}card.appendChild(row);
  }
  async function prepare(entry,pageId,call,endpoint,deleted){
    if(deleted)return entry;
    var photos=[];
    for(var photo of entry.photos||[]){
      if(photo.pageId===pageId&&photo.blockId){photos.push(photo);continue;}
      if(photo.externalUrl&&safeLink(photo.externalUrl)){photos.push(photo);continue;}
      var key='upload:'+endpoint+':'+photo.id,upload=await store('get',key);
      if(!upload||Date.parse(upload.expiresAt)<Date.now()+60000){
        var blob=photo.revision&&photo.localRevision!==photo.revision?null:await store('get',photo.cacheKey||photo.id);
        if(blob){var form=new FormData();form.append('file',blob,'diary-image.jpg');upload=await call('/upload',form);}
        else if(photo.pageId){upload=await call('/copy-upload',{pageId:photo.pageId,photoId:photo.id});}
        else throw new Error('本机图片缺失，请重新选择或从含图片的备份恢复');
        await store('put',key,upload);
      }
      photos.push({...photo,fileUploadId:upload.fileUploadId});
    }
    return {...entry,photos:photos};
  }
  window.MediaAssets={store:store,hash:hash,safeLink:safeLink,links:links,renderSheet:renderSheet,decorate:decorate,prepare:prepare,assetInfo:assetInfo,cleanupAssets:cleanupAssets};
  renderTimeline();
})();
