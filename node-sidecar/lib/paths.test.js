'use strict';

// Dependency-free checks for DA0 data-dir threading.  Run: node lib/paths.test.js
// Verifies: unset env keeps the legacy path (Pi/dev unchanged); LOCALHUB_DATA_DIR
// relocates the whole data set; and a real persisted file (pairing.json) lands in
// the relocated dir rather than beside the script.

const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ok   -', name); }
  catch (e) { failures++; console.error('  FAIL -', name, '\n         ', e.message); }
}

function freshPaths() {
  delete require.cache[require.resolve('./paths')];
  return require('./paths');
}

// 1. Unset env → legacy `<sidecar>/data` (Pi / standalone dev stay byte-identical).
check('unset env falls back to <sidecar>/data', () => {
  delete process.env.LOCALHUB_DATA_DIR;
  const { dataDir, SIDECAR_ROOT } = freshPaths();
  assert.strictEqual(dataDir(), path.join(SIDECAR_ROOT, 'data'));
});

// 2. Set env → that dir; inData joins beneath it.
check('LOCALHUB_DATA_DIR is honored + inData joins under it', () => {
  const tmp = path.join(os.tmpdir(), 'ce-paths-' + process.pid);
  process.env.LOCALHUB_DATA_DIR = tmp;
  const { dataDir, inData } = freshPaths();
  assert.strictEqual(dataDir(), tmp);
  assert.strictEqual(inData('whisper', 'ggml.bin'), path.join(tmp, 'whisper', 'ggml.bin'));
});

// 3. End-to-end: pairing.json is written into the relocated dir (no split-brain).
check('pairing.json is written into the relocated data dir', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-pairing-'));
  process.env.LOCALHUB_DATA_DIR = tmp;
  freshPaths();
  delete require.cache[require.resolve('./pairing')];
  const pairing = require('./pairing');
  const token = pairing.getToken();
  assert.ok(token && token.length === 64, 'a 32-byte hex token was generated');
  assert.ok(fs.existsSync(path.join(tmp, 'pairing.json')), 'pairing.json in relocated dir');
});

delete process.env.LOCALHUB_DATA_DIR;
if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nall paths checks passed');
