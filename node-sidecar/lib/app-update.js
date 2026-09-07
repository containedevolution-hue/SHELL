'use strict';
const fs=require('node:fs'), path=require('node:path'), {randomUUID}=require('node:crypto');
const {validateRelease,installRelease}=require('./app-install');
const {createRegistry}=require('./app-registry');
function newer(candidate,current) {
  if(!/^\d+\.\d+\.\d+$/.test(candidate) || !/^\d+\.\d+\.\d+$/.test(current)) return false;
  const a=candidate.split('.').map(Number), b=current.split('.').map(Number);
  for(let i=0;i<3;i++) if(a[i]!==b[i]) return a[i]>b[i];
  return false;
}
function updateRelease(bytes,expectedHash,appsDirectory) {
  const {manifest,files}=validateRelease(bytes,expectedHash);
  const root=path.resolve(appsDirectory), current=createRegistry(root).list().find(app=>app.id===manifest.id);
  if(!current || !newer(manifest.version,current.version)) throw new Error('Only a newer compatible release can be activated');
  const versions=path.join(root,'.releases',manifest.id), destination=path.join(versions,manifest.version);
  fs.mkdirSync(versions,{recursive:true});
  if(!fs.existsSync(destination)) {
    const stage=path.join(versions,'.stage-'+randomUUID());
    try { const installed=installRelease(bytes,expectedHash,stage); fs.renameSync(installed.directory,destination); }
    finally { fs.rmSync(stage,{recursive:true,force:true}); }
  }
  // A retained version is reusable only when all bytes still match this release.
  for(const [relative,body] of files) {
    const installed=fs.readFileSync(path.join(destination,relative));
    if(!installed.equals(body)) throw new Error('Retained release changed');
  }
  const pointer=path.join(root,manifest.id,'.active-release.json'), temporary=pointer+'.'+randomUUID();
  try { fs.writeFileSync(temporary,JSON.stringify({version:manifest.version,sha256:expectedHash}),{flag:'wx'}); fs.renameSync(temporary,pointer); }
  finally { if(fs.existsSync(temporary))fs.unlinkSync(temporary); }
  return {id:manifest.id,version:manifest.version,previousVersion:current.version};
}
module.exports={updateRelease,newer};
