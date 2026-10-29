// diary-release: 2026.10.29.3
/* Text-only diary cards. Rendering and PNG export stay entirely on this device. */
(function(){
 'use strict';
 const SIZE=360,SCALE=3,FONT='-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
 const BODY=14,LINE=23,LEFT=32,WIDTH=296,LINES=8;
 const themes={cream:{name:'奶油拼贴',paper:'#f8f1e3',tag:'#eee0c4',ink:'#594c39'},letter:{name:'花间来信',paper:'#f6f4e9',tag:'#e2e6d2',ink:'#4e5746'},night:{name:'晚安手账',paper:'#f9ede7',tag:'#e7dce9',ink:'#615264'}};
 const dialog=document.getElementById('card-dialog'),canvas=document.getElementById('card-canvas'),status=document.getElementById('card-status');
 let entry,pages=[],index=0,theme='cream',sequence=0,file=null,trigger;
 const backgrounds=new Map();
 function flower(x,y,s,color){return `<g transform="translate(${x} ${y}) scale(${s})" opacity=".8"><circle cy="-3" r="3.4" fill="${color}"/><circle cx="3" r="3.4" fill="${color}"/><circle cy="3" r="3.4" fill="${color}"/><circle cx="-3" r="3.4" fill="${color}"/><circle r="1.4" fill="#bd9155"/></g>`;}
 function branch(x,y,s,rotation,color='#9da88a'){
  return `<g transform="translate(${x} ${y}) rotate(${rotation}) scale(${s})" fill="${color}" opacity=".68"><path d="M0 0Q-4-28 4-63" fill="none" stroke="#8d977a" stroke-width="1.1"/><path d="M0-9Q-25-13-19-29Q-3-29 0-9M0-26Q20-28 19-45Q4-44 0-26M2-43Q-14-48-10-61Q1-61 2-43"/></g>`;
 }
 function art(key){
  const base=`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360" viewBox="0 0 360 360"><defs><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".65" numOctaves="3" seed="12" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><radialGradient id="wash"><stop stop-color="#c5aed0" stop-opacity=".38"/><stop offset="1" stop-color="#c5aed0" stop-opacity="0"/></radialGradient></defs><rect width="360" height="360" fill="${themes[key].paper}"/><rect width="360" height="360" filter="url(#grain)" opacity=".055"/>`;
  let decor='';
  if(key==='cream'){
   decor='<path d="M0 0H126L105 8 90 8 73 18 58 17 39 27 21 25 0 39Z" fill="#dbc39b" opacity=".68"/><path d="M0 292L15 301 25 298 42 313 57 311 73 330 91 333 107 351 129 360H0Z" fill="#d6bd91" opacity=".65"/><path d="m15 17 65-13 4 16-64 14Z" fill="#fffdf5" opacity=".57" stroke="#e0d4bf"/>';
   decor+=branch(336,46,.65,-35)+branch(26,352,.76,45);
   for(const [x,y,s]of [[327,16,.9],[342,30,.65],[317,34,.8],[23,324,.9],[39,339,.8],[55,345,.6]])decor+=flower(x,y,s,'#e5bd68');
  }else if(key==='letter'){
   for(let y=91;y<302;y+=23)decor+=`<path d="M30 ${y}H330" stroke="#c2bea4" stroke-width=".5" opacity=".2"/>`;
   decor+=branch(8,55,.8,35)+branch(359,365,.7,-25)+branch(330,372,.45,-74);
   for(const [x,y]of [[23,15],[8,34],[335,313],[321,332],[344,345]])decor+=flower(x,y,.65,'#e8c78b');
   decor+='<path d="M305 13h29v29h-29Z" fill="none" stroke="#b4bc9d" stroke-width="1" stroke-dasharray="2 2" opacity=".6"/><path d="M291 24q9-4 18 0m-22 5q10-4 21 0m-21 5q10-4 21 0" fill="none" stroke="#a9b18d" stroke-width=".7" opacity=".6"/>';
   decor+=branch(321,36,.29,8);
  }else{
   // Open corners leave room for the moon, cup, and multi-page folio.
   decor+='<g fill="none" stroke="#b4a2b9" stroke-linecap="round" stroke-linejoin="round"><path d="M272 17H29Q17 17 17 29V287M77 343H153M207 343H331Q343 343 343 331V74" stroke-width=".8" opacity=".72"/><path d="M42 22H30Q22 22 22 30V62M320 338H329Q338 338 338 329V304" stroke-width=".45" opacity=".48"/></g>';
   decor+='<ellipse cx="315" cy="22" rx="73" ry="51" fill="url(#wash)"/><ellipse cx="15" cy="359" rx="84" ry="56" fill="url(#wash)"/><path d="M322 12a15 15 0 1 0 13 22 14 14 0 0 1-13-22Z" fill="#e7ca84" opacity=".85"/>';
   for(const [x,y,s]of [[301,17,3],[346,44,3],[288,39,2],[341,8,2]])decor+=`<path d="m${x} ${y-s} ${s/2} ${s/2} ${s/2} ${s/2} -${s/2} ${s/2} -${s/2} ${s/2} -${s/2}-${s/2} -${s/2}-${s/2} ${s/2}-${s/2}Z" fill="#d7b679"/>`;
   decor+=branch(357,363,.48,-25,'#aca0b5')+branch(11,349,.54,26,'#aca0b5');
   decor+='<g fill="none" stroke="#b1a2b3" stroke-width="1.2" opacity=".7"><path d="M24 317h26v16a10 10 0 0 1-10 10h-6a10 10 0 0 1-10-10Z" fill="#f5e8e8"/><path d="M50 321h3a7 7 0 0 1 0 12h-3M20 346h36M33 312q-4-5 0-10m8 10q-4-5 0-10"/></g>';
   for(const [x,y]of [[19,330],[8,314],[346,333]])decor+=flower(x,y,.5,'#c1a9cc');
  }
  return base+decor+'</svg>';
 }
 async function background(key){if(!backgrounds.has(key))backgrounds.set(key,new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('卡片背景未加载，请重新打开'));image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(art(key));}));return backgrounds.get(key);}
 const segments=text=>typeof Intl.Segmenter==='function'?Array.from(new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(text),s=>s.segment):Array.from(text);
 function lines(text,ctx,width){
  const result=[];
  for(const paragraph of text.replace(/\r\n?/g,'\n').split('\n')){
   if(!paragraph){result.push('');continue;}
   let line='';
   for(const char of segments(paragraph)){
    if(line&&ctx.measureText(line+char).width>width){
     // Keep a closing punctuation mark with its preceding character, within the paper margin.
     if(/^[，。！？；：、）》」』】…,.!?;:)]$/.test(char)&&ctx.measureText(line+char).width<=width+BODY){result.push(line+char);line='';}
     else{result.push(line);line=char;}
    }else line+=char;
   }
   if(line)result.push(line);
  }
  return result.length?result:[''];
 }
 function ellipsis(text,ctx,width){if(ctx.measureText(text).width<=width)return text;const chars=segments(text);while(chars.length&&ctx.measureText(chars.join('')+'…').width>width)chars.pop();return chars.join('')+'…';}
 function dateLabel(date){const d=new Date(date+'T00:00:00');return Number.isNaN(d.getTime())?date:`${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 · 周${'日一二三四五六'[d.getDay()]}`;}
 function rounded(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
 async function render(){
  if(!entry||!pages.length||!dialog.open)return;
  const token=++sequence;file=null;document.getElementById('card-save').disabled=document.getElementById('card-share').disabled=true;
  const key=theme,pageIndex=index,source=entry,part=pages[pageIndex];status.textContent='正在排版…';
  try{
   const bg=await background(key),sheet=document.createElement('canvas');sheet.width=sheet.height=SIZE*SCALE;
   const ctx=sheet.getContext('2d');ctx.scale(SCALE,SCALE);ctx.drawImage(bg,0,0,SIZE,SIZE);ctx.textBaseline='alphabetic';ctx.fillStyle=themes[key].ink;ctx.font=`12px ${FONT}`;ctx.fillText(dateLabel(source.date),LEFT,58);
   const tags=(source.tags||[]).join(' · ');if(tags){ctx.font=`11px ${FONT}`;const label=ellipsis(tags,ctx,WIDTH-18),w=Math.min(WIDTH,ctx.measureText(label).width+18);ctx.fillStyle=themes[key].tag;rounded(ctx,LEFT,72,w,20,10);ctx.fillStyle=themes[key].ink;ctx.fillText(label,LEFT+9,86);}
   ctx.font=`400 ${BODY}px ${FONT}`;ctx.fillStyle='#514c44';part.forEach((line,i)=>ctx.fillText(line,LEFT,117+i*LINE));
   ctx.font=`12px ${FONT}`;ctx.fillStyle=themes[key].ink;ctx.textAlign='right';ctx.fillText(ellipsis(source.source||'未署名',ctx,WIDTH-40),SIZE-LEFT,324);
   if(pages.length>1){ctx.font=`10px ${FONT}`;ctx.textAlign='center';ctx.fillStyle='#928a7f';ctx.fillText(`${pageIndex+1} / ${pages.length}`,SIZE/2,344);}
   const blob=await new Promise((resolve,reject)=>sheet.toBlob(b=>b?resolve(b):reject(new Error('图片生成失败，请重试')),'image/png'));
   if(token!==sequence||!dialog.open)return;
   canvas.width=canvas.height=SIZE*SCALE;canvas.getContext('2d').drawImage(sheet,0,0);canvas.setAttribute('aria-label',`${themes[key].name}，${dateLabel(source.date)}，第${pageIndex+1}张，共${pages.length}张`);
   document.getElementById('card-readable').textContent=part.join('\n');
   file=new File([blob],`diary-${source.date}-${key}-${pageIndex+1}.png`,{type:'image/png'});
   document.getElementById('card-count').textContent=`${pageIndex+1} / ${pages.length}`;
   document.getElementById('card-prev').disabled=pageIndex===0;document.getElementById('card-next').disabled=pageIndex===pages.length-1;
   document.getElementById('card-pagination').hidden=pages.length===1;
   document.getElementById('card-save').disabled=false;
   let share=false;try{share=!!navigator.canShare?.({files:[file]});}catch(_){}
   document.getElementById('card-share').hidden=!share;document.getElementById('card-share').disabled=!share;
   status.textContent=pages.length>1?`文字已分为${pages.length}张方形卡片；可切换并逐张保存。`:'仅包含文字、日期、标签和署名，在本机生成。';
  }catch(error){if(token===sequence)status.textContent=error.message;}
 }
 async function open(value,button){
  if(!value.text?.trim()){showToast('这篇日记没有文字，暂时无法生成卡片');return;}
  sequence++;entry=structuredClone(value);index=0;trigger=button;file=null;pages=[];
  document.getElementById('card-save').disabled=document.getElementById('card-share').disabled=true;document.getElementById('card-pagination').hidden=true;
  canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
  dialog.showModal();status.textContent='正在排版…';
  try{await document.fonts.ready;const ctx=document.createElement('canvas').getContext('2d');ctx.font=`400 ${BODY}px ${FONT}`;const all=lines(entry.text,ctx,WIDTH);pages=[];for(let i=0;i<all.length;i+=LINES)pages.push(all.slice(i,i+LINES));await render();}catch(error){status.textContent='卡片未生成：'+error.message;}
 }
 for(const button of document.querySelectorAll('[data-card-style]'))button.onclick=()=>{theme=button.dataset.cardStyle;document.querySelectorAll('[data-card-style]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));index=Math.min(index,pages.length-1);render();};
 document.getElementById('card-prev').onclick=()=>{if(index>0){index--;render();}};
 document.getElementById('card-next').onclick=()=>{if(index<pages.length-1){index++;render();}};
 document.getElementById('card-close').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{sequence++;file=null;if(trigger?.isConnected)trigger.focus({preventScroll:true});});
 document.getElementById('card-save').onclick=()=>{if(!file)return;const url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);showToast('已生成卡片，可在下载文件中查看');};
 document.getElementById('card-share').onclick=async()=>{if(!file)return;try{await navigator.share({files:[file]});}catch(error){if(error.name!=='AbortError')showToast('暂时无法分享，可先保存卡片');}};
 window.DiaryCards={open};
})();
