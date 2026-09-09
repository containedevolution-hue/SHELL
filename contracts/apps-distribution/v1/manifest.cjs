'use strict';
function normalizeManifest(input) {
  if(!input||input.contractVersion!==1||typeof input.name!=='string'||!input.name.trim()||!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(input.version||'')||!/^[a-z][a-z0-9-]{1,62}$/.test(input.id||''))return null;
  if(!input.entrypoints||!/^web\/[a-zA-Z0-9_.\/-]+$/.test(input.entrypoints.web||'')||input.entrypoints.web.split('/').some(part=>!part||part==='..'||part==='.'))return null;
  const capabilities=Array.isArray(input.capabilities)?input.capabilities:[];
  if(capabilities.some(item=>!item||!item.id||!['required','optional'].includes(item.requirement)||item.requirement==='required'&&item.id!=='storage.documents.local')||new Set(capabilities.map(item=>item.id)).size!==capabilities.length)return null;
  return Object.freeze({contractVersion:1,id:input.id,name:input.name.slice(0,80),version:input.version,entrypoints:{web:input.entrypoints.web},capabilities:capabilities.map(item=>({id:String(item.id),requirement:item.requirement}))});
}
module.exports={normalizeManifest};
