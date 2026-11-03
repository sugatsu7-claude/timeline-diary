const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),png=f=>{const b=fs.readFileSync(path.join(root,f));assert.equal(b.toString('ascii',1,4),'PNG',f+' is a PNG');return [b.readUInt32BE(16),b.readUInt32BE(20)];};
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8')),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
for(const icon of manifest.icons){const [w,h]=png(icon.src);assert.equal(`${w}x${h}`,icon.sizes,icon.src+' matches its declared size');assert.ok(sw.includes(`'${icon.src}'`),icon.src+' is cached for offline use');}
for(const purpose of ['any','maskable'])for(const size of ['192x192','512x512'])assert.ok(manifest.icons.some(i=>i.purpose===purpose&&i.sizes===size),`${purpose} ${size} icon present`);
const apple=html.match(/<link rel="apple-touch-icon" sizes="180x180" href="\.\/([^"]+)">/);assert.ok(apple,'iPhone home-screen icon is declared');assert.deepEqual(png(apple[1]),[180,180]);assert.ok(sw.includes(`'${apple[1]}'`));
console.log('PASS: home-screen icons (any + maskable, 192/512, iPhone 180) exist at declared sizes and are cached offline.');
