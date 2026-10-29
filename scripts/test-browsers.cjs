const {spawnSync}=require('node:child_process'),path=require('node:path');
for(const file of ['setup','pwa','cards','authors','pagination','media','incremental','reliability','sync-reliability','backup-storage','updates']){
 const result=spawnSync(process.execPath,[path.join(__dirname,'..','tests',file+'.test.cjs')],{stdio:'inherit',env:process.env});
 if(result.status!==0)process.exit(result.status||1);
}
