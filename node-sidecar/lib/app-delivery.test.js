'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), os=require('node:os'), crypto=require('node:crypto'), express=require('express');
const {syncCatalog}=require('./app-catalog-source');
const {installRelease}=require('./app-install');
const {updateRelease}=require('./app-update');
const {createRegistry}=require('./app-registry');
const {createAppStore}=require('./app-store');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function fixture(version) {
  const manifest={contractVersion:1,id:'notes',name:'Notes',version,entrypoints:{web:'web/index.html'},capabilities:[{id:'storage.documents.local',requirement:'required'}]};
  const files={'app.manifest.json':JSON.stringify(manifest),'web/index.html':`<h1>${version}</h1>`};
  const bytes=Buffer.from(JSON.stringify({contractVersion:1,kind:'ce.app.release',id:'notes',version,files:Object.entries(files).map(([path,body])=>({path,encoding:'base64',content:Buffer.from(body).toString('base64'),sha256:hash(body)}))}));
  return {bytes,app:{id:'notes',name:'Notes',version,description:'Notes',hosts:{shell:'local-web'},release:`apps/notes/${version}/notes-${version}.ceapp.json`,sha256:hash(bytes)}};
}
test('canonical feed refresh is bounded and atomic, rejects redirected origins and corrupt releases',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'shell-feed-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  let release=fixture('0.1.0'), corrupt=false, calls=[];
  const transport=async(url,options)=>{calls.push({url,options});return new Response(url.endsWith('/catalog.json')?JSON.stringify({contractVersion:1,apps:[release.app]}):corrupt?'bad':release.bytes);};
  const first=await syncCatalog(directory,{transport});assert.equal(first.apps[0].version,'0.1.0');
  assert.ok(calls.every(c=>c.options.redirect==='error' && !c.options.headers.Authorization));
  release=fixture('0.2.0');corrupt=true;await assert.rejects(syncCatalog(directory,{transport}),/digest/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'catalog.json'))).apps[0].version,'0.1.0');
  corrupt=false;release.app.release='https://evil.example/release';await assert.rejects(syncCatalog(directory,{transport}),/release URL/);
  release=fixture('0.2.0');await syncCatalog(directory,{transport});assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'catalog.json'))).apps[0].version,'0.2.0');
});
test('explicit update atomically switches release and keeps the stable browser origin, previous bytes and data',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'shell-update-')), directory=path.join(root,'apps'), catalog=path.join(root,'catalog');
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(catalog);
  const old=fixture('0.1.0'), next=fixture('0.2.0');installRelease(old.bytes,old.app.sha256,directory);
  const registry=createRegistry(directory), launch=registry.list()[0].launchUrl;
  fs.writeFileSync(path.join(directory,'owner-data.txt'),'preserve');
  fs.writeFileSync(path.join(catalog,'notes.ceapp.json'),next.bytes);
  fs.writeFileSync(path.join(catalog,'catalog.json'),JSON.stringify({contractVersion:1,apps:[{...next.app,file:'notes.ceapp.json'}]}));
  const app=express();app.use('/v1/app-store',createAppStore({catalogDirectory:catalog,appsDirectory:directory}));app.use('/v1/apps',registry.router());
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
  const origin=`http://127.0.0.1:${server.address().port}`, store=await(await fetch(origin+'/v1/app-store')).json();
  assert.equal(store.apps[0].updateAvailable,true);
  const updated=await fetch(origin+'/v1/app-store/notes/install',{method:'POST',headers:{'X-Shell-Install':store.installToken,Origin:origin}});
  assert.equal(updated.status,200);assert.equal((await updated.json()).updated,true);
  assert.equal(registry.list()[0].version,'0.2.0');assert.equal(registry.list()[0].launchUrl,launch);
  assert.equal(await(await fetch(origin+launch)).text(),'<h1>0.2.0</h1>');
  assert.equal(fs.readFileSync(path.join(directory,'notes/web/index.html'),'utf8'),'<h1>0.1.0</h1>');
  assert.equal(fs.readFileSync(path.join(directory,'owner-data.txt'),'utf8'),'preserve');
  assert.throws(()=>updateRelease(old.bytes,old.app.sha256,directory),/newer/);
  assert.throws(()=>updateRelease(Buffer.from('bad'),next.app.sha256,directory),/digest/);
  assert.equal(registry.list()[0].version,'0.2.0');
});
