'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createRegistry, normalizeManifest, safeChild } = require('./app-registry');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-apps-'));
  const app = path.join(root, 'scribble');
  fs.mkdirSync(path.join(app, 'web'), { recursive:true });
  fs.writeFileSync(path.join(app, 'web', 'index.html'), '<h1>Scribble</h1>');
  fs.writeFileSync(path.join(app, 'app.manifest.json'), JSON.stringify({
    contractVersion:1, id:'scribble', name:'Scribble', version:'1.0.0',
    entrypoints:{ web:'web/index.html' },
    capabilities:[{ id:'storage.documents.local', requirement:'required' }],
  }));
  return root;
}

test('registry discovers only installed v1 apps with a real web entrypoint', () => {
  const root = fixture();
  const registry = createRegistry(root);
  assert.deepEqual(registry.list().map(item => ({ id:item.id, launchUrl:item.launchUrl })), [
    { id:'scribble', launchUrl:'/v1/apps/scribble/web/index.html' },
  ]);
  fs.rmSync(root, { recursive:true, force:true });
});

test('manifest and asset paths cannot escape an installed app', () => {
  const directory = path.resolve('installed-app');
  assert.equal(safeChild(directory, '../secret'), null);
  assert.equal(normalizeManifest({ contractVersion:1, id:'scribble', entrypoints:{ web:'../index.html' }, capabilities:[] }, directory), null);
});
