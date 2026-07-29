'use strict';

// Dependency-free checks for DA0 jail scoping + audit.  Run: node mcp/jail.test.js
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

// Fresh temp data dir so the allowlist + audit files are isolated.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-jail-'));
process.env.LOCALHUB_DATA_DIR = dataDir;
const mkdir = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

// 1. Default-deny: nothing shared → empty roots, all reads rejected.
check('default-deny when nothing is shared', () => {
  cleanEnv(); allowlist.save([]);
  assert.deepStrictEqual(jail.allowedRoots(), []);
  assert.ok(throws(() => jail.resolveJailed(path.join(os.tmpdir(), 'x'))), 'absolute read denied');
  assert.ok(throws(() => jail.resolveJailed('anything')), 'relative read denied');
});

// 2. MCP_ROOT override: within resolves, outside rejected, relative ok (single root).
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

// 3. Allowlist file shares a folder.
check('allowlist file shares a folder', () => {
  cleanEnv();
  const shared = mkdir('ce-shared-');
  allowlist.save([shared]);
  assert.ok(jail.allowedRoots().includes(path.resolve(shared)));
  assert.strictEqual(jail.resolveJailed(path.join(shared, 'notes.md')), path.resolve(shared, 'notes.md'));
  assert.ok(throws(() => jail.resolveJailed(path.join(os.homedir(), 'secret.txt'))), 'outside shared rejected');
  allowlist.save([]);
});

// 4. Relative path is ambiguous with multiple shared folders; absolute still works.
check('relative path rejected with multiple roots', () => {
  cleanEnv();
  const a = mkdir('ce-a-'); const b = mkdir('ce-b-');
  allowlist.save([a, b]);
  assert.strictEqual(jail.allowedRoots().length, 2);
  assert.ok(throws(() => jail.resolveJailed('relative.txt')), 'relative ambiguous → rejected');
  assert.strictEqual(jail.resolveJailed(path.join(a, 'ok.txt')), path.resolve(a, 'ok.txt'));
  allowlist.save([]);
});

// 5. Appliance (Pi) back-compat: 0.0.0.0 bind → home dir when nothing else shared.
check('appliance mode falls back to home dir', () => {
  cleanEnv(); allowlist.save([]);
  process.env.LOCALHUB_HOST = '0.0.0.0';
  assert.deepStrictEqual(jail.allowedRoots(), [path.resolve(os.homedir())]);
  cleanEnv();
});

// 6. Audit log appends a JSON line.
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
