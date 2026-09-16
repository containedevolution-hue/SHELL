'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { validateRelease } = require('./app-install');
const CATALOG_URL = 'https://apps.containedevolution.com/catalog.json';

async function readBounded(url, limit, transport = fetch) {
  const response = await transport(url, {redirect:'error',signal:AbortSignal.timeout(10000),headers:{Accept:'application/json'}});
  if (!response.ok || Number(response.headers.get('content-length')) > limit) throw new Error('Apps download unavailable or too large');
  const chunks=[]; let size=0;
  for await (const chunk of response.body) { size+=chunk.length; if(size>limit) { throw new Error('Apps download too large'); } chunks.push(Buffer.from(chunk)); }
  return Buffer.concat(chunks);
}

async function syncCatalog(directory, { catalogUrl = CATALOG_URL, transport = fetch } = {}) {
  const endpoint = new URL(catalogUrl);
  if(endpoint.protocol!=='https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('Trusted HTTPS Apps origin required');
  const bytes=await readBounded(endpoint.href,256*1024,transport), input=JSON.parse(bytes);
  if(input.contractVersion!==1 || !Array.isArray(input.apps) || input.apps.length>100) throw new Error('Unsupported Apps catalog');
  const seen=new Set(), apps=[], artifacts=[];
  for(const item of input.apps) {
    if(!/^[a-z][a-z0-9-]{1,62}$/.test(item.id) || seen.has(item.id) || !/^\d+\.\d+\.\d+$/.test(item.version) || !/^[a-f0-9]{64}$/.test(item.sha256)) throw new Error('Invalid Apps identity');
    seen.add(item.id);
    if(item.private || item.stage==='acceptance' || item.hosts?.shell!=='local-web') continue;
    const url=new URL(item.release,endpoint), base=`/apps/${item.id}/${item.version}/`;
    if(url.origin!==endpoint.origin || url.username || url.password || url.search || url.hash || url.pathname!==`${base}${item.id}-${item.version}.ceapp.json`) throw new Error('Invalid Apps release URL');
    const file=`${item.id}-${item.version}-${item.sha256}.ceapp.json`, target=path.join(directory,file);
    const artifact=fs.existsSync(target)?fs.readFileSync(target):await readBounded(url.href,20*1024*1024,transport);
    const {manifest}=validateRelease(artifact,item.sha256);
    if(manifest.id!==item.id || manifest.version!==item.version) throw new Error('Apps release identity mismatch');
    apps.push({id:manifest.id,name:manifest.name,version:manifest.version,description:String(item.description||''),file,sha256:item.sha256});
    artifacts.push({target,artifact});
  }
  const catalog={contractVersion:1,sourceUrl:endpoint.href,apps};
  // Activate only after every selected artifact passes the host validator. Failed
  // refreshes leave the previous catalog and installed applications usable.
  fs.mkdirSync(directory,{recursive:true});
  for(const {target,artifact} of artifacts) if(!fs.existsSync(target)) fs.writeFileSync(target,artifact,{flag:'wx'});
  const temporary=path.join(directory,`.catalog-${crypto.randomUUID()}.json`);
  try { fs.writeFileSync(temporary,JSON.stringify(catalog,null,2)+'\n',{flag:'wx'}); fs.renameSync(temporary,path.join(directory,'catalog.json')); }
  finally { if(fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  return catalog;
}
module.exports={CATALOG_URL,syncCatalog,readBounded};
