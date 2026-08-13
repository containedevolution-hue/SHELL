'use strict';

const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

const jail = require('./jail');
const allowlist = require('./allowlist');
const audit = require('./audit');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ok   -', name); }
  catch (e) { failures++; console.error('  FAIL -', name, '\n         ', e.stack || e.message); }
}
const throws = (fn) => { try { fn(); return false; } catch (_) { return true; } };
const cleanEnv = () => { delete process.env.MCP_ROOT; delete process.env.LOCALHUB_HOST; };

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-jail-'));
process.env.LOCALHUB_DATA_DIR = dataDir;
const mkdir = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

check('default-deny when nothing is shared', () => {
  cleanEnv(); allowlist.save([]);
  assert.deepStrictEqual(jail.allowedRoots(), []);
  assert.ok(throws(() => jail.resolveJailed(path.join(os.tmpdir(), 'x'))), 'absolute read denied');
  assert.ok(throws(() => jail.resolveJailed('anything')), 'relative read denied');
});

check('MCP_ROOT allows within, rejects outside', () => {
  cleanEnv(); allowlist.save([]);
  const root = mkdir('ce-root-');
  process.env.MCP_ROOT = root;
  assert.deepStrictEqual(jail.allowedRoots(), [path.resolve(root)]);
  assert.strictEqual(jail.resolveJailed(path.join(root, 'a.txt')), path.resolve(root, 'a.txt'));
  assert.strictEqual(jail.resolveJailed('a.txt'), path.resolve(root, 'a.txt'));
  assert.ok(throws(() => jail.resolveJailed(path.join(os.tmpdir(), 'nope.txt'))), 'outside rejected');
  cleanEnv();
});

check('allowlist file shares a folder', () => {
  cleanEnv();
  const shared = mkdir('ce-shared-');
  allowlist.save([shared]);
  assert.ok(jail.allowedRoots().includes(path.resolve(shared)));
  assert.strictEqual(jail.resolveJailed(path.join(shared, 'notes.md')), path.resolve(shared, 'notes.md'));
  assert.ok(throws(() => jail.resolveJailed(path.join(os.homedir(), 'secret.txt'))), 'outside shared rejected');
  allowlist.save([]);
});

check('relative path rejected with multiple roots', () => {
  cleanEnv();
  const a = mkdir('ce-a-'); const b = mkdir('ce-b-');
  allowlist.save([a, b]);
  assert.strictEqual(jail.allowedRoots().length, 2);
  assert.ok(throws(() => jail.resolveJailed('relative.txt')), 'relative ambiguous → rejected');
  assert.strictEqual(jail.resolveJailed(path.join(a, 'ok.txt')), path.resolve(a, 'ok.txt'));
  allowlist.save([]);
});

check('appliance mode falls back to home dir', () => {
  cleanEnv(); allowlist.save([]);
  process.env.LOCALHUB_HOST = '0.0.0.0';
  assert.deepStrictEqual(jail.allowedRoots(), [path.resolve(os.homedir())]);
  cleanEnv();
});

check('a junction planted inside a shared folder cannot escape it', () => {
  cleanEnv(); allowlist.save([]);
  const shared = mkdir('ce-jail-shared-');
  const outside = mkdir('ce-jail-outside-');
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret');
  process.env.MCP_ROOT = shared;
  let linked = true;
  try { fs.symlinkSync(outside, path.join(shared, 'link'), 'junction'); }
  catch (_) { linked = false; }
  if (linked) {
    assert.ok(throws(() => jail.resolveJailed(path.join(shared, 'link', 'secret.txt'))), 'junction escape rejected');
  }
  assert.strictEqual(jail.resolveJailed(path.join(shared, 'inside.txt')), path.join(fs.realpathSync(shared), 'inside.txt'));
  cleanEnv();
});

check('a path that does not exist yet still resolves inside its shared folder', () => {
  cleanEnv(); allowlist.save([]);
  const shared = mkdir('ce-jail-new-');
  process.env.MCP_ROOT = shared;
  const target = path.join(shared, 'nested', 'deeper', 'new.txt');
  assert.strictEqual(jail.resolveJailed(target), path.join(fs.realpathSync(shared), 'nested', 'deeper', 'new.txt'));
  assert.ok(throws(() => jail.resolveJailed(path.join(os.tmpdir(), 'ce-absent', 'new.txt'))), 'outside absent path rejected');
  cleanEnv();
});

check('sharing a folder does not grant write access to it', () => {
  cleanEnv();
  const shared = mkdir('ce-jail-ro-');
  allowlist.save([shared]);
  assert.deepStrictEqual(allowlist.writable(), []);
  assert.deepStrictEqual(jail.writableRoots(), []);
  assert.ok(throws(() => jail.resolveWritable(path.join(shared, 'x.txt'))), 'write denied without approval');
  assert.strictEqual(jail.resolveJailed(path.join(shared, 'x.txt')), path.join(fs.realpathSync(shared), 'x.txt'));
  allowlist.save([]);
});

check('write approval is scoped to the approved folder only', () => {
  cleanEnv();
  const writableDir = mkdir('ce-jail-rw-');
  const readOnly = mkdir('ce-jail-ro2-');
  allowlist.save([writableDir, readOnly]);
  allowlist.allowWrite(writableDir);
  assert.deepStrictEqual(allowlist.writable(), [writableDir]);
  assert.strictEqual(jail.resolveWritable(path.join(writableDir, 'ok.txt')), path.join(fs.realpathSync(writableDir), 'ok.txt'));
  assert.ok(throws(() => jail.resolveWritable(path.join(readOnly, 'no.txt'))), 'unapproved folder stays read-only');
  allowlist.denyWrite(writableDir);
  assert.ok(throws(() => jail.resolveWritable(path.join(writableDir, 'ok.txt'))), 'revoking write takes effect');
  allowlist.save([]);
});

check('unsharing a folder also drops its write approval', () => {
  cleanEnv();
  const dir = mkdir('ce-jail-drop-');
  allowlist.save([dir]);
  allowlist.allowWrite(dir);
  assert.deepStrictEqual(allowlist.writable(), [dir]);
  allowlist.remove(dir);
  assert.deepStrictEqual(allowlist.list(), []);
  assert.deepStrictEqual(allowlist.writable(), []);
});

check('audit.record appends a JSON line', () => {
  audit.record({ tool: 'read_file', path: 'X', bytes: 5 });
  const lines = fs.readFileSync(path.join(dataDir, 'mcp-audit.log'), 'utf8').trim().split('\n');
  const last = JSON.parse(lines[lines.length - 1]);
  assert.strictEqual(last.tool, 'read_file');
  assert.ok(last.t, 'has timestamp');
});

cleanEnv();
delete process.env.LOCALHUB_DATA_DIR;
if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nall jail checks passed');
