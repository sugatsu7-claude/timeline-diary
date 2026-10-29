// diary-release: 2026.10.29.2
/* Stored ZIP archives: blobs remain blobs, avoiding whole-library base64 strings. */
(function(){
 'use strict';
 const encode=new TextEncoder(),decode=new TextDecoder();
 const table=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
 async function crc(blob){let value=0xffffffff;const reader=blob.stream().getReader();while(true){const {done,value:chunk}=await reader.read();if(done)break;for(const byte of chunk)value=table[(value^byte)&255]^(value>>>8);}return(value^0xffffffff)>>>0;}
 function header(size){const bytes=new Uint8Array(size);return{bytes,view:new DataView(bytes.buffer)};}
 async function build(files){
  if(files.length>65535)throw new Error('备份文件过多，请按日期分批导出');
  const parts=[],central=[];let offset=0,centralSize=0;
  for(const file of files){const name=encode.encode(file.name),blob=file.blob,size=blob.size,checksum=await crc(blob);if(size>0xffffffff||offset+size+name.length+30>0xffffffff)throw new Error('备份超过4GB，请缩小备份日期范围');
   const local=header(30);local.view.setUint32(0,0x04034b50,true);local.view.setUint16(4,20,true);local.view.setUint16(6,0x800,true);local.view.setUint32(14,checksum,true);local.view.setUint32(18,size,true);local.view.setUint32(22,size,true);local.view.setUint16(26,name.length,true);parts.push(local.bytes,name,blob);
   const c=header(46);c.view.setUint32(0,0x02014b50,true);c.view.setUint16(4,20,true);c.view.setUint16(6,20,true);c.view.setUint16(8,0x800,true);c.view.setUint32(16,checksum,true);c.view.setUint32(20,size,true);c.view.setUint32(24,size,true);c.view.setUint16(28,name.length,true);c.view.setUint32(42,offset,true);central.push(c.bytes,name);centralSize+=46+name.length;offset+=30+name.length+size;
  }
  if(offset+centralSize+22>0xffffffff)throw new Error('备份超过4GB，请缩小日期范围');
  const end=header(22);end.view.setUint32(0,0x06054b50,true);end.view.setUint16(8,files.length,true);end.view.setUint16(10,files.length,true);end.view.setUint32(12,centralSize,true);end.view.setUint32(16,offset,true);
  return new Blob(parts.concat(central,end.bytes),{type:'application/zip'});
 }
 async function read(file){
  const tail=new Uint8Array(await file.slice(Math.max(0,file.size-65557)).arrayBuffer()),v=new DataView(tail.buffer);let end=-1;
  for(let i=tail.length-22;i>=0;i--)if(v.getUint32(i,true)===0x06054b50&&i+22+v.getUint16(i+20,true)===tail.length){end=i;break;}
  if(end<0||v.getUint16(end+4,true)||v.getUint16(end+6,true))throw new Error('不是受支持的日记ZIP备份');
  const count=v.getUint16(end+10,true),size=v.getUint32(end+12,true),offset=v.getUint32(end+16,true);
  if(offset+size>file.size||size>16000000)throw new Error('ZIP目录大小不正确');
  const directory=new Uint8Array(await file.slice(offset,offset+size).arrayBuffer()),d=new DataView(directory.buffer),entries=new Map();let pos=0;
  for(let i=0;i<count;i++){
   if(pos+46>size||d.getUint32(pos,true)!==0x02014b50)throw new Error('ZIP目录损坏');
   const flags=d.getUint16(pos+8,true),method=d.getUint16(pos+10,true),checksum=d.getUint32(pos+16,true),compressed=d.getUint32(pos+20,true),length=d.getUint32(pos+24,true),nameLength=d.getUint16(pos+28,true),extra=d.getUint16(pos+30,true),comment=d.getUint16(pos+32,true),localOffset=d.getUint32(pos+42,true);
   const name=decode.decode(directory.slice(pos+46,pos+46+nameLength));pos+=46+nameLength+extra+comment;
   if(flags&1||method!==0||compressed!==length||!name||name.includes('..')||name.startsWith('/')||name.includes('\\')||entries.has(name)||pos>size)throw new Error('ZIP包含不受支持或重复的项目');
   if(length>(name==='manifest.json'?50000000:20000000))throw new Error('ZIP单个文件过大');
   entries.set(name,{checksum,length,localOffset});
  }
  return{names:Array.from(entries.keys()),get:async name=>{const entry=entries.get(name);if(!entry)throw new Error('备份缺少文件：'+name);const local=new DataView(await file.slice(entry.localOffset,entry.localOffset+30).arrayBuffer());if(local.byteLength!==30||local.getUint32(0,true)!==0x04034b50)throw new Error('ZIP文件头损坏');const start=entry.localOffset+30+local.getUint16(26,true)+local.getUint16(28,true);if(start+entry.length>offset)throw new Error('ZIP文件范围不正确');const blob=file.slice(start,start+entry.length);if(await crc(blob)!==entry.checksum)throw new Error('ZIP文件校验失败');return blob;}};
 }
 window.DiaryArchive={build,read};
})();
