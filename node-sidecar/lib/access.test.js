'use strict';

const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-access-'));
process.env.LOCALHUB_DATA_DIR = dataDir;

const accessControl = require('./access');
const { isLoopbackRequest } = require('./scoped-auth');
const allowlist = require('../mcp/allowlist');
const browser = require('../mcp/browser');
const moveToTrash = require('../mcp/tools/move-to-trash');

let failures = 0;
const pending = [];
function check(name, fn) { pending.push([name, fn]); }
const mkdir = (p) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), p)));

let server;
let base;
let guarded;
let guardedBase;
function loopbackOnly(req, res, next) {
  if (isLoopbackRequest(req)) return next();
  return res.status(403).json({ error: 'loopback_only' });
}
function start() {
  return new Promise((resolve) => {
    const app = express();
    app.use('/access', accessControl.router());
    server = app.listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${server.address().port}/access`;
      const wired = express();
      wired.use('/access', loopbackOnly, accessControl.router());
      guarded = wired.listen(0, '127.0.0.1', () => {
        guardedBase = `http://127.0.0.1:${guarded.address().port}/access`;
        resolve();
      });
    });
  });
}

function rawStatus(headers) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: guarded.address().port,
      path: '/access/state',
      method: 'GET',
      headers,
    }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.end();
  });
}

async function call(pathname, options) {
  const opts = options || {};
  const headers = opts.body != null ? { 'Content-Type': 'application/json' } : {};
  const res = await fetch(base + pathname, { ...opts, headers });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

check('a folder is shared read-only and writing stays off until approved', async () => {
  const dir = mkdir('ce-acc-dir-');
  const added = await call('/folders', { method: 'POST', body: JSON.stringify({ path: dir }) });
  assert.strictEqual(added.status, 200);
  assert.strictEqual(added.body.folders.length, 1);
  assert.strictEqual(added.body.folders[0].writable, false, 'sharing does not grant writing');

  const granted = await call('/folders/write', { method: 'POST', body: JSON.stringify({ path: dir, allowed: true }) });
  assert.strictEqual(granted.body.folders[0].writable, true);
  assert.deepStrictEqual(allowlist.writable(), [dir]);

  const revoked = await call('/folders/write', { method: 'POST', body: JSON.stringify({ path: dir, allowed: false }) });
  assert.strictEqual(revoked.body.folders[0].writable, false);
  await call('/folders', { method: 'DELETE', body: JSON.stringify({ path: dir }) });
});

check('writing cannot be approved for a folder that was never shared', async () => {
  allowlist.save([]);
  const stranger = mkdir('ce-acc-stranger-');
  const res = await call('/folders/write', { method: 'POST', body: JSON.stringify({ path: stranger, allowed: true }) });
  assert.strictEqual(res.status, 400, 'refused');
  assert.deepStrictEqual(allowlist.writable(), []);
});

check('a file or missing path is refused with a plain explanation', async () => {
  const dir = mkdir('ce-acc-file-');
  const file = path.join(dir, 'note.txt');
  fs.writeFileSync(file, 'x');
  const asFile = await call('/folders', { method: 'POST', body: JSON.stringify({ path: file }) });
  assert.strictEqual(asFile.status, 400);
  assert.ok(/file/i.test(asFile.body.error), 'explains it is a file');

  const missing = await call('/folders', { method: 'POST', body: JSON.stringify({ path: path.join(dir, 'nope') }) });
  assert.strictEqual(missing.status, 400);
  assert.ok(/does not exist/i.test(missing.body.error));
  allowlist.save([]);
});

check('the browser list normalizes what a person actually types', async () => {
  browser.saveDomains([]);
  for (const typed of ['https://www.Example.com/some/page', 'EXAMPLE.com', '.example.com']) {
    assert.strictEqual(accessControl.normalizeDomain(typed), 'example.com', typed);
  }
  assert.strictEqual(accessControl.normalizeDomain('not a domain'), null);
  assert.strictEqual(accessControl.normalizeDomain(''), null);

  const added = await call('/websites', { method: 'POST', body: JSON.stringify({ domain: 'https://www.Example.com/x' }) });
  assert.deepStrictEqual(added.body.domains, ['example.com']);
  const junk = await call('/websites', { method: 'POST', body: JSON.stringify({ domain: 'nonsense' }) });
  assert.strictEqual(junk.status, 400);
  const removed = await call('/websites', { method: 'DELETE', body: JSON.stringify({ domain: 'example.com' }) });
  assert.deepStrictEqual(removed.body.domains, []);
});

check('browsing lists folders and can walk up, never returning file contents', async () => {
  const root = mkdir('ce-acc-browse-');
  fs.mkdirSync(path.join(root, 'visible'));
  fs.mkdirSync(path.join(root, '.hidden'));
  fs.writeFileSync(path.join(root, 'secret.txt'), 'do not show me');
  const res = await call('/browse?path=' + encodeURIComponent(root));
  assert.strictEqual(res.status, 200);
  const names = res.body.folders.map((f) => f.name);
  assert.deepStrictEqual(names, ['visible'], 'directories only, hidden skipped');
  assert.ok(!JSON.stringify(res.body).includes('do not show me'), 'no file contents');
  assert.ok(!JSON.stringify(res.body).includes('secret.txt'), 'no file names');
  assert.ok(res.body.parent, 'can walk up');
});

check('a trashed file is listed and restored to where it came from', async () => {
  const dir = mkdir('ce-acc-trash-');
  allowlist.save([dir]);
  allowlist.allowWrite(dir);
  const target = path.join(dir, 'restore-me.txt');
  fs.writeFileSync(target, 'contents');
  await moveToTrash.execute({ path: target });
  assert.strictEqual(fs.existsSync(target), false, 'moved out');

  const listed = await call('/trash');
  assert.strictEqual(listed.body.items.length, 1);
  assert.strictEqual(listed.body.items[0].original_path, target);

  const restored = await call('/trash/restore', { method: 'POST', body: JSON.stringify({ id: listed.body.items[0].id }) });
  assert.strictEqual(restored.status, 200);
  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'contents', 'contents intact');
  assert.strictEqual((await call('/trash')).body.items.length, 0, 'trash emptied');
  allowlist.save([]);
});

check('restore refuses to overwrite something already at the original path', async () => {
  const dir = mkdir('ce-acc-clash-');
  allowlist.save([dir]);
  allowlist.allowWrite(dir);
  const target = path.join(dir, 'clash.txt');
  fs.writeFileSync(target, 'old');
  await moveToTrash.execute({ path: target });
  fs.writeFileSync(target, 'new');

  const listed = await call('/trash');
  const res = await call('/trash/restore', { method: 'POST', body: JSON.stringify({ id: listed.body.items[0].id }) });
  assert.strictEqual(res.status, 409, 'refused');
  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'new', 'existing file untouched');
  allowlist.save([]);
});

check('the audit feed reports what the tools actually did, newest first', async () => {
  const audit = require('../mcp/audit');
  audit.record({ tool: 'read_file', path: 'C:/one.txt' });
  audit.record({ tool: 'write_file', path: 'C:/two.txt' });
  const res = await call('/audit?limit=2');
  assert.strictEqual(res.body.events.length, 2);
  assert.strictEqual(res.body.events[0].tool, 'write_file', 'newest first');
  assert.ok(res.body.events[0].t, 'timestamped');
});

check('state reports folders, websites and browser reachability together', async () => {
  const dir = mkdir('ce-acc-state-');
  allowlist.save([dir]);
  browser.saveDomains(['example.com']);
  process.env.MCP_BROWSER_PORT = '1';
  const res = await call('/state');
  assert.strictEqual(res.body.folders.length, 1);
  assert.deepStrictEqual(res.body.browser.domains, ['example.com']);
  assert.strictEqual(res.body.browser.reachable, false, 'honest about no browser');
  assert.ok(res.body.home, 'offers a starting folder for the picker');
  delete process.env.MCP_BROWSER_PORT;
  allowlist.save([]);
  browser.saveDomains([]);
});

check('a tunnelled request cannot reach access even though cloudflared is on this machine', async () => {
  const direct = await fetch(guardedBase + '/state');
  assert.strictEqual(direct.status, 200, 'someone at the machine gets through');

  const proxyHeaders = ['cf-connecting-ip', 'cf-ray', 'x-forwarded-for', 'x-real-ip', 'forwarded'];
  for (const header of proxyHeaders) {
    const res = await fetch(guardedBase + '/state', { headers: { [header]: '203.0.113.7' } });
    assert.strictEqual(res.status, 403, `${header} is refused`);
  }

  assert.strictEqual(await rawStatus({ host: 'hub.tenari.world' }), 403, 'a public Host header is refused');
  assert.strictEqual(await rawStatus({}), 200, 'a genuine local Host still works');

  const granted = await fetch(guardedBase + '/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.7' },
    body: JSON.stringify({ path: os.tmpdir() }),
  });
  assert.strictEqual(granted.status, 403, 'a tunnelled caller cannot grant itself a folder');
  assert.deepStrictEqual(allowlist.list(), [], 'nothing was shared');
});

(async () => {
  await start();
  for (const [name, fn] of pending) {
    try { await fn(); console.log('  ok   -', name); }
    catch (e) { failures++; console.error('  FAIL -', name, '\n         ', e.stack || e.message); }
  }
  server.close();
  guarded.close();
  delete process.env.LOCALHUB_DATA_DIR;
  if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
  console.log('\nall access checks passed');
})();
