'use strict';

// Dependency-free checks for DA0 migration.  Run: node lib/migrate-data.test.js
const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { migrateIfNeeded } = require('./migrate-data');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ok   -', name); }
  catch (e) { failures++; console.error('  FAIL -', name, '\n         ', e.stack || e.message); }
}
function tmp(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }
function seedLegacy(dir) {
  fs.mkdirSync(path.join(dir, 'ce-memories-1'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'pairing.json'), JSON.stringify({ pairing_token: 'x'.repeat(64), user_id: 'u1' }));
  fs.writeFileSync(path.join(dir, 'ce-memories-1', '000001.ldb'), 'leveldbdata');
}
const MARKER = '.ce-migrated.json';
const hasMarker = (d) => fs.existsSync(path.join(d, MARKER));
const readMarker = (d) => JSON.parse(fs.readFileSync(path.join(d, MARKER), 'utf8'));

// 1. No-op when the data dir IS the legacy dir (Pi / dev, env unset).
check('no-op when dataDir == <sidecar>/data', () => {
  const box = tmp('ce-mig-noop-');
  const legacy = path.join(box, 'data');
  seedLegacy(legacy);
  migrateIfNeeded(legacy, box);
  assert.ok(!hasMarker(legacy), 'no marker written for the legacy-is-current case');
});

// 2. Fresh install (no legacy data) → nothing migrated, new dir stays empty.
check('fresh install with no legacy → no marker', () => {
  const box = tmp('ce-mig-fresh-');       // no data/ dir at all
  const newDir = tmp('ce-mig-newf-');
  migrateIfNeeded(newDir, box);
  assert.ok(!hasMarker(newDir), 'no marker');
  assert.strictEqual(fs.readdirSync(newDir).length, 0, 'new dir left empty');
});

// 3. Migration copies + verifies + writes marker pointing at the legacy source.
check('migrates legacy -> relocated dir, verified, marker.from set', () => {
  const box = tmp('ce-mig-run-');
  const legacy = path.join(box, 'data');
  seedLegacy(legacy);
  const newDir = tmp('ce-mig-newr-');
  migrateIfNeeded(newDir, box);
  assert.ok(fs.existsSync(path.join(newDir, 'pairing.json')), 'pairing.json copied');
  const src = fs.statSync(path.join(legacy, 'ce-memories-1', '000001.ldb')).size;
  const dst = fs.statSync(path.join(newDir, 'ce-memories-1', '000001.ldb')).size;
  assert.strictEqual(dst, src, 'ldb size matches');
  assert.ok(hasMarker(newDir), 'marker written');
  assert.strictEqual(path.resolve(readMarker(newDir).from), path.resolve(legacy), 'marker.from = legacy');
});

// 4. Re-runs increment the boot count; legacy is reclaimed after KEEP_LEGACY_BOOTS.
check('re-runs increment boots; legacy reclaimed after 3 boots', () => {
  const box = tmp('ce-mig-boots-');
  const legacy = path.join(box, 'data');
  seedLegacy(legacy);
  const newDir = tmp('ce-mig-newb-');
  migrateIfNeeded(newDir, box); // boot 1 (migrate)
  assert.ok(fs.existsSync(legacy), 'legacy present after boot 1');
  migrateIfNeeded(newDir, box); // boot 2
  assert.ok(fs.existsSync(legacy), 'legacy present after boot 2');
  assert.strictEqual(readMarker(newDir).boots, 2, 'boots == 2');
  migrateIfNeeded(newDir, box); // boot 3 → reclaim
  assert.ok(!fs.existsSync(legacy), 'legacy reclaimed after boot 3');
  assert.strictEqual(readMarker(newDir).legacyDeleted, true, 'legacyDeleted flag set');
  assert.ok(fs.existsSync(path.join(newDir, 'pairing.json')), 'new data intact after reclaim');
});

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nall migrate-data checks passed');
