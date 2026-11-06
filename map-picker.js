// diary-release: 2026.11.06.1
/* Explicit, online-only map selection. No background geolocation or Worker calls. */
(function(){
 'use strict';
 const dialog=document.getElementById('map-picker'),status=document.getElementById('map-picker-status'),query=document.getElementById('map-picker-query'),results=document.getElementById('map-picker-results'),name=document.getElementById('map-picker-name'),confirm=document.getElementById('map-picker-confirm'),search=document.getElementById('map-picker-search'),gps=document.getElementById('map-picker-current');
 const cache=new Map();let map,pin,selected=null,session=0,editorToken=0,controller,library,lastSearch=0,searchSequence=0,gpsSequence=0;
 function valid(lat,lon){return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180;}
 function exact(url){try{const u=new URL(url),text=u.searchParams.get('query')||u.searchParams.get('q')||u.searchParams.get('ll')||'',m=text.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);if(m&&valid(+m[1],+m[2]))return{lat:+m[1],lon:+m[2]};}catch(_){}return null;}
 function active(token){return token===session&&dialog.open&&editorToken===locationRequest&&document.getElementById('sheet').classList.contains('open');}
 function paint(){
  confirm.disabled=!selected;document.getElementById('map-picker-coordinates').textContent=selected?selected.lat.toFixed(6)+', '+selected.lon.toFixed(6):'点击地图或选择搜索结果来放置图钉。';
  if(!map||!selected)return;
  if(!pin){const icon=L.divIcon({className:'diary-map-pin',html:'<span></span>',iconSize:[24,32],iconAnchor:[12,28]});pin=L.marker([selected.lat,selected.lon],{icon,draggable:true,keyboard:true,alt:'已选择的位置，可拖动微调'}).addTo(map);pin.on('dragend',()=>{const p=pin.getLatLng();setPoint(p.lat,p.lng,name.value);});}
  else pin.setLatLng([selected.lat,selected.lon]);
 }
 function setPoint(lat,lon,title){if(!Number.isFinite(lon))return;lon=((lon+180)%360+360)%360-180;if(!valid(lat,lon))return;gpsSequence++;gps.disabled=false;controller?.abort();searchSequence++;search.disabled=false;selected={lat,lon};if(title!==undefined)name.value=String(title).slice(0,200);if(!name.value.trim())name.value='地图选点';paint();}
 function loadLibrary(){
  if(window.L)return Promise.resolve();if(library)return library;
  library=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';script.integrity='sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';script.crossOrigin='anonymous';const timer=setTimeout(()=>{script.remove();reject(Error('地图库加载超时'));},12000);script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);script.remove();reject(Error('地图库暂不可用'));};document.head.appendChild(script);}).catch(e=>{library=null;throw e;});return library;
 }
 async function showMap(token){
  try{await loadLibrary();if(!active(token))return;
   if(!map){map=L.map('map-picker-canvas',{zoomControl:true,attributionControl:true,worldCopyJump:true}).setView([20,0],2,{animate:false});L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'}).addTo(map).on('tileerror',()=>{if(dialog.open)document.getElementById('map-picker-tile-status').textContent='地图图块暂不可用；可稍后重试，或使用搜索结果的位置。';});map.on('click',e=>{setPoint(e.latlng.lat,e.latlng.lng,name.value);status.textContent='已放置图钉，可拖动微调后确认。';});}
   map.invalidateSize();if(selected)map.setView([selected.lat,selected.lon],16,{animate:false});else map.setView([20,0],2,{animate:false});paint();
  }catch(e){if(active(token))status.textContent=e.message+'。仍可搜索并选择结果，或关闭后粘贴地图分享链接。';}
 }
 function list(features,token){
  if(!active(token))return;results.replaceChildren();let count=0;
  for(const feature of features.slice(0,6)){const c=feature?.geometry?.coordinates,p=feature?.properties||{};if(feature?.geometry?.type!=='Point'||!Array.isArray(c)||!valid(c[1],c[0]))continue;
   const title=String(p.name||[p.street,p.housenumber].filter(Boolean).join(' ')||query.value).slice(0,200),address=Array.from(new Set([p.housenumber,p.street,p.city||p.town||p.village,p.state,p.country].filter(Boolean))).join(' · ');
   const button=document.createElement('button'),label=document.createElement('span'),detail=document.createElement('small');button.type='button';button.className='map-picker-result';label.textContent=title;detail.textContent=address||'可在地图上确认位置';button.append(label,detail);button.onclick=()=>{if(!active(token))return;setPoint(c[1],c[0],title);if(map)map.setView([c[1],c[0]],17,{animate:false});status.textContent='已选择地点。可拖动图钉微调，或直接使用这个位置。';};results.appendChild(button);count++;
  }
  status.textContent=count?'请选择候选地点，确认图钉位置。':'未找到候选地点。可换个名称，加入城市，或直接在地图上点选。';
 }
 async function runSearch(){
  const text=query.value.trim();if(!text){status.textContent='请输入地点名称，也可以直接在地图上点选。';return;}if(search.disabled)return;
  const token=session,seq=++searchSequence;if(Date.now()-lastSearch<1000){status.textContent='请稍候再搜索。';return;}lastSearch=Date.now();
  controller?.abort();controller=new AbortController();const ownController=controller;const center=map?.getCenter(),bias=center&&map.getZoom()>=8?{lat:center.lat,lon:center.lng}:selected;
  const params=new URLSearchParams({q:text,limit:'6'});if(bias){params.set('lat',String(bias.lat));params.set('lon',String(bias.lon));}
  const key=params.toString(),hit=cache.get(key);if(hit&&hit.until>Date.now()){list(hit.features,token);return;}
  search.disabled=true;status.textContent='正在搜索开放地图…';results.replaceChildren();const timer=setTimeout(()=>ownController.abort(),12000);
  try{const response=await fetch('https://photon.komoot.io/api/?'+params,{signal:ownController.signal});if(!response.ok)throw Error(response.status===429?'搜索繁忙，请稍后重试':'地点搜索暂不可用');const data=await response.json();if(!Array.isArray(data.features))throw Error('搜索结果格式不正确');data.features=data.features.slice(0,6);if(!active(token)||seq!==searchSequence)return;
   if(cache.size>=30)cache.delete(cache.keys().next().value);cache.set(key,{features:data.features,until:Date.now()+600000});list(data.features,token);
  }catch(e){if(active(token)&&seq===searchSequence)status.textContent=e.name==='AbortError'?'搜索超时，可重试或直接在地图上点选。':e.message+'，可直接在地图上点选。';}
  finally{clearTimeout(timer);if(active(token)&&seq===searchSequence)search.disabled=false;}
 }
 function open(){
  resetLocationRequest();editorToken=locationRequest;const token=++session;controller?.abort();searchSequence++;search.disabled=false;gps.disabled=false;results.replaceChildren();lastSearch=0;
  name.value=document.getElementById('entry-location-name').value;query.value=['当前位置','地图选点'].includes(name.value)?'':name.value;selected=exact(document.getElementById('entry-location-url').value);if(pin){pin.remove();pin=null;}paint();document.getElementById('map-picker-tile-status').textContent='';status.textContent='选择搜索结果，或在地图上点选位置。';dialog.showModal();requestAnimationFrame(()=>{showMap(token);if(query.value.trim()&&!selected)runSearch();});
 }
 document.getElementById('location-search').onclick=open;
 query.addEventListener('input',()=>{searchSequence++;controller?.abort();search.disabled=false;results.replaceChildren();status.textContent='填写完成后点击搜索。';});
 search.onclick=runSearch;query.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();runSearch();}};
 document.getElementById('map-picker-close').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{session++;searchSequence++;controller?.abort();search.disabled=false;gps.disabled=false;if(map){map.remove();map=null;pin=null;}});
 gps.onclick=()=>{if(!navigator.geolocation){status.textContent='当前浏览器不支持定位，可搜索或在地图上点选。';return;}const token=session,request=++gpsSequence;gps.disabled=true;status.textContent='正在请求当前位置…';navigator.geolocation.getCurrentPosition(position=>{if(!active(token)||request!==gpsSequence)return;gps.disabled=false;const lat=position.coords.latitude,lon=position.coords.longitude;if(!valid(lat,lon)){status.textContent='未取得有效位置。';return;}setPoint(lat,lon,name.value||'当前位置');if(map)map.setView([lat,lon],17,{animate:false});status.textContent='已定位，可微调图钉后确认。';},e=>{if(active(token)&&request===gpsSequence){gps.disabled=false;status.textContent=e.code===1?'未获得定位权限，可搜索或在地图上点选。':'暂时无法取得位置，可重试或在地图上点选。';}},{enableHighAccuracy:true,timeout:15000,maximumAge:0});};
 confirm.onclick=()=>{if(!active(session)||!selected){dialog.close();return;}document.getElementById('entry-location-name').value=name.value.trim()||'地图选点';document.getElementById('entry-location-url').value=mapSearchUrl(selected.lat.toFixed(6)+','+selected.lon.toFixed(6));document.getElementById('entry-location-url').dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('location-status').textContent='已保存选定坐标，可点击地点在地图中查看。';dialog.close();};
 window.DiaryMapPicker={isOpen:()=>dialog.open,close:()=>dialog.close()};
})();
