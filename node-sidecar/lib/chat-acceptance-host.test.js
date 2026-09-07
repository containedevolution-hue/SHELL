'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { PROFILE } = require('./chat-acceptance-install');
const { createChatAcceptanceHost, exactObservation } = require('./chat-acceptance-host');
const { createRegistry } = require('./native-desk-registry');

const now = 10000;
function observation() {
  return { ...PROFILE, windowLabel:'chat-acceptance', origin:'http://127.0.0.1:5984',
    url:'http://127.0.0.1:5984/__shell/chat-acceptance/web/index.html', alive:true, processId:7,
    windowId:'window-7', nativeSessionId:'process-7-start-1', frameId:'frame-1', navigationId:'navigation-1',
    assetRoot:'C:\\acceptance\\chat', workspaceId:3, windowBounds:[-1200,0,1200,800],
    layout:{observedAt:now,contentMatchesWindow:true,windowId:'window-7',nativeSessionId:'process-7-start-1',
      compositorSize:[1200,800],viewport:{width:1200,height:800},rect:{x:100,y:50,width:900,height:650}} };
}
function fixture() {
  const current = observation();
  const provider = {platform:'linux',pid:8,windowId:'provider-8',nativeSessionId:'provider-process',processExecutable:'/provider',
    initialClass:'Provider',at:[0,0],size:[900,650],workspaceId:4,workspace:'separate',floating:true};
  const backend = {probe:async()=>({available:true,compositor:'fixture'}),listWindows:async()=>[structuredClone(provider)],
    location:(window,slot)=>window.workspace==='holding'?'parked':window.at[0]===slot.x&&window.at[1]===slot.y?'attached':'standalone',
    describe:()=>'',applicationFound:async()=>true};
  const registry = createRegistry({contract:'com.containedevolution.shell.native-clients',version:2,clients:[{clientId:'fixture',label:'Fixture',identities:{linux:{
    desktopId:'fixture',executable:'/provider',args:[],initialClasses:['Provider'],processExecutables:['/provider'],
    validation:{status:'passed',validatedAt:'2026-09-07T00:00:00Z',evidence:'fixture'}}}}]},'linux');
  const nativeLifecycle = {observe:async()=>structuredClone(current)};
  return {current,host:createChatAcceptanceHost({nativeLifecycle,backend,registry,hostId:'shell-test',acceptancePassed:false,now:()=>now})};
}

test('canonical Chat host binds exact artifact, label, origin, frame and native lifetime', async () => {
  const f=fixture(); const port=await f.host.connect();
  assert.equal((await port.observe()).deskManager.state,'unavailable');
  f.current.navigationId='navigation-2';
  await assert.rejects(port.observe(),/navigation changed/);
  assert.equal(f.host.revoked,true);
});

test('navigation, process, window, frame, origin and liveness changes fail closed', () => {
  const initial=observation();
  for (const changed of [
    {...initial,url:'https://example.com/'},{...initial,alive:false},{...initial,processId:8},{...initial,windowId:'other'},
    {...initial,frameId:'other'},{...initial,sha256:'0'.repeat(64)},{...initial,url:initial.url+'?secret=x'}]) {
    assert.throws(()=>exactObservation(changed,initial));
  }
});
