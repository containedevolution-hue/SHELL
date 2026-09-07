'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const {startChatAcceptanceRuntime}=require('./chat-acceptance-runtime');

test('acceptance runtime is opt-in Windows-only and never opens a provider',()=>{
  const nativePort={accepted:true,lifecycle:{observe:async()=>({})},driver:{}};
  assert.equal(startChatAcceptanceRuntime({nativePort,platform:'linux',env:{SHELL_CHAT_ACCEPTANCE_WINDOW:'enabled'}}),null);
  assert.equal(startChatAcceptanceRuntime({nativePort,platform:'win32',env:{}}),null);
});

test('private watcher binds, observes, revokes and retries without exposing its port',async()=>{
  const timers=[];let connects=0,observes=0,closes=0;
  const nativePort={accepted:true,lifecycle:{observe:async()=>({})},driver:{probe:async()=>({available:false})}};
  const hostFactory=()=>({connect:async()=>{connects++;return{observe:async()=>{observes++;if(observes===2)throw new Error('lost')}}},close:async()=>{closes++}});
  const watcher=startChatAcceptanceRuntime({nativePort,platform:'win32',env:{SHELL_CHAT_ACCEPTANCE_WINDOW:'enabled'},hostFactory,
    registryFile:require('node:path').join(__dirname,'..','config','native-desk-clients.json'),setIntervalFn:fn=>{timers.push(fn);return{unref(){}}},clearIntervalFn:()=>{}});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(watcher.connected,true);
  await timers[0]();assert.equal(watcher.connected,false);await timers[0]();assert.equal(connects,2);
  await watcher.close();assert.ok(closes>=2);assert.equal(Object.hasOwn(watcher,'port'),false);
});
