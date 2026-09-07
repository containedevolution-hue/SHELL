'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const root=path.resolve(__dirname,'..');

test('private Chat acceptance remains absent from every public catalog',()=>{
  const catalogs=[require('../contracts/app-catalog.json'),require('../node-sidecar/catalog/catalog.json')];
  for(const catalog of catalogs) assert.equal(catalog.apps.some(app=>app.id==='chat'),false);
  assert.equal(fs.existsSync(path.join(root,'node-sidecar','catalog','chat-0.1.0-dev.ceapp.json')),false);
});

test('acceptance host pins exact artifact and Tauri navigation without page authority',()=>{
  const installer=fs.readFileSync(path.join(root,'node-sidecar','lib','chat-acceptance-install.js'),'utf8');
  const host=fs.readFileSync(path.join(root,'node-sidecar','lib','chat-acceptance-host.js'),'utf8');
  const rust=fs.readFileSync(path.join(root,'src-tauri','src','chat_acceptance.rs'),'utf8');
  const main=fs.readFileSync(path.join(root,'src-tauri','src','main.rs'),'utf8');
  for(const source of [installer,rust]) assert.match(source,/2261aba0f5a2b8d79339d5072e992c7457c7a9e9ce8139e5c3246a804ff4d1b7/);
  assert.match(host,/PROFILE/);
  assert.match(main,/chat-acceptance-navigation/);
  assert.doesNotMatch(rust,/#\[tauri::command\]/);
  const handlers=main.match(/invoke_handler\(tauri::generate_handler!\[([\s\S]*?)\]\)/)?.[1]||'';
  assert.doesNotMatch(handlers,/chat.acceptance|native.desk/i);
  assert.doesNotMatch(installer,/app-store|\/v1\/apps/);
});
