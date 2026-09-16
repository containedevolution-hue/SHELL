'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const express = require('express');
const { installRelease } = require('./app-install');
const { createRegistry } = require('./app-registry');
const hash = value => createHash('sha256').update(value).digest('hex');
function release(extra = {}, manifestChanges = {}) {
  const manifest = { contractVersion:1, id:'scribble', name:'Scribble', version:'0.2.0', entrypoints:{ web:'web/index.html' }, capabilities:[{ id:'storage.documents.local', requirement:'required' }], ...manifestChanges };
  const data = { 'app.manifest.json':JSON.stringify(manifest), 'web/index.html':'<h1>Scribble</h1>', ...extra };
  const bytes = Buffer.from(JSON.stringify({ contractVersion:1, kind:'ce.app.release', id:manifest.id, version:manifest.version, files:Object.entries(data).map(([name, body]) => ({ path:name, encoding:'base64', content:Buffer.from(body).toString('base64'), sha256:hash(body) })) }));
  return { bytes, digest:hash(bytes) };
}
test('verified release installs atomically, launches, and preserves existing installations', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-install-'));
  t.after(() => fs.rmSync(root, { recursive:true, force:true }));
  const { bytes, digest } = release();
  installRelease(bytes, digest, root);
  assert.throws(() => installRelease(bytes, digest, root), /already installed/);
  const registry = createRegistry(root);
  assert.equal(registry.list()[0].version, '0.2.0');
  const app = express(); app.use('/v1/apps', registry.router());
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal(await (await fetch(origin + registry.list()[0].launchUrl)).text(), '<h1>Scribble</h1>');
  fs.writeFileSync(path.join(root, 'scribble', 'secret.txt'), 'private');
  assert.equal((await fetch(origin + '/v1/apps/scribble/secret.txt')).status, 404);
  assert.equal((await fetch(origin + registry.list()[0].launchUrl, { method:'POST' })).status, 405);
});
test('tampering, traversal, case collisions and unsupported capabilities never install', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-install-'));
  t.after(() => fs.rmSync(root, { recursive:true, force:true }));
  const valid = release();
  assert.throws(() => installRelease(valid.bytes, '0'.repeat(64), root), /digest mismatch/);
  for (const candidate of [release({'web/../../escape':'bad'}), release({'web/INDEX.html':'collision'}), release({}, {capabilities:[{id:'files.scoped',requirement:'required'}]})]) {
    assert.throws(() => installRelease(candidate.bytes, candidate.digest, root));
  }
  assert.deepEqual(fs.readdirSync(root), []);
});
