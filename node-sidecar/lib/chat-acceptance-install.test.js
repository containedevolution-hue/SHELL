'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createRegistry } = require('./app-registry');
const { createChatAcceptanceAssets, installChatAcceptance, validateChatAcceptanceRelease } = require('./chat-acceptance-install');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function fixture(changes = {}, manifestChanges = {}) {
  const manifest = { contractVersion:1, id:'chat', name:'Chat', version:'0.1.0-dev', entrypoints:{core:'src/model.js',web:'web/index.html'},
    capabilities:[{id:'storage.chat.preferences.local',requirement:'required'}], ...manifestChanges };
  const content = { 'app.manifest.json':JSON.stringify(manifest), 'src/model.js':'export {};', 'web/index.html':'<h1>Private Chat</h1>' };
  const release = { contractVersion:1, kind:'ce.app.release', id:'chat', version:'0.1.0-dev', private:true, stage:'acceptance',
    files:Object.entries(content).map(([name, body]) => ({path:name,encoding:'base64',sha256:hash(body),content:Buffer.from(body).toString('base64')})), ...changes };
  const bytes = Buffer.from(JSON.stringify(release));
  return { bytes, profile:{id:'chat',version:'0.1.0-dev',private:true,stage:'acceptance',sha256:hash(bytes)} };
}

test('private Chat acceptance installs outside the public app registry and serves only fixed assets', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-chat-acceptance-'));
  t.after(() => fs.rmSync(root, {recursive:true,force:true}));
  const {bytes,profile} = fixture();
  const installed = installChatAcceptance(bytes, path.join(root,'acceptance'), profile);
  assert.equal(installChatAcceptance(bytes, path.join(root,'acceptance'), profile).sha256,profile.sha256);
  assert.equal(installed.private, true);
  assert.deepEqual(createRegistry(path.join(root,'apps')).list(), []);
  const assets = createChatAcceptanceAssets(path.join(root,'acceptance'), profile);
  assert.equal(assets.identity().sha256, profile.sha256);
  const app = express(); app.use('/__shell/chat-acceptance', assets.router);
  const server = app.listen(0,'127.0.0.1'); await new Promise(resolve => server.once('listening',resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal(await (await fetch(origin+'/__shell/chat-acceptance/web/index.html')).text(), '<h1>Private Chat</h1>');
  assert.equal((await fetch(origin+'/__shell/chat-acceptance/.shell-chat-acceptance.json')).status, 404);
  assert.equal((await fetch(origin+'/__shell/chat-acceptance/web/index.html',{method:'POST'})).status, 405);
  fs.writeFileSync(path.join(installed.directory,'web','extra.js'),'not in signed release');
  assert.equal((await fetch(origin+'/__shell/chat-acceptance/web/extra.js')).status, 404);
  fs.writeFileSync(path.join(installed.directory,'web','index.html'),'tampered');
  assert.equal(assets.identity(),null);
});

test('acceptance lane rejects wrong digest, visibility, stage, identity and required capability', () => {
  const valid = fixture();
  assert.doesNotThrow(() => validateChatAcceptanceRelease(valid.bytes, valid.profile.sha256, valid.profile));
  assert.throws(() => validateChatAcceptanceRelease(valid.bytes, '0'.repeat(64), valid.profile), /Untrusted/);
  for (const candidate of [fixture({private:false}),fixture({stage:'public'}),fixture({id:'notes'}),
    fixture({}, {capabilities:[{id:'storage.documents.local',requirement:'required'}]})]) {
    assert.throws(() => validateChatAcceptanceRelease(candidate.bytes, candidate.profile.sha256, candidate.profile));
  }
});
