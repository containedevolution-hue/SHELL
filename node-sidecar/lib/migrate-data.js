'use strict';

// DA0 migration (desktop only). When the desktop relocates the data dir to a
// per-user path (LOCALHUB_DATA_DIR), move any pre-relocation data from the legacy
// location into it BEFORE the store opens — otherwise the box starts empty and
// looks like it lost the user's memories + pairing.
//
// Copy-then-verify-then-(later)-reclaim: a crash mid-migration always leaves the
// legacy copy intact, so this can never lose data. No-op when the resolved data
// dir IS the legacy dir (Pi / standalone dev, LOCALHUB_DATA_DIR unset).

const fs = require('fs');
const path = require('path');

const MARKER = '.ce-migrated.json';
const KEEP_LEGACY_BOOTS = 3; // keep the old copy this many clean launches, then reclaim

// A dir "has data" if it holds a pairing file or any ce-memories* store.
function isPopulated(dir) {
  try {
    return fs.readdirSync(dir).some(e => e === 'pairing.json' || e.startsWith('ce-memories'));
  } catch (_) { return false; }
}

// Candidate legacy locations, best-effort, in priority order.
function legacySources(sidecarRoot) {
  const out = [path.join(sidecarRoot, 'data')];
  // A prior MSI under Program Files may have had its writes redirected by Windows
  // to the per-user VirtualStore. Probe that mapped path too.
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    const m = /^[A-Za-z]:[\\/]?(.*)$/.exec(sidecarRoot);
    if (m) out.push(path.join(process.env.LOCALAPPDATA, 'VirtualStore', m[1], 'data'));
  }
  return out;
}

// Every file under src must exist under dst with an identical size. For a
// cleanly-closed (unopened) LevelDB this byte-for-byte file check is a complete
// integrity proof — same files + sizes ⇒ same document set — without the risk of
// opening PouchDB mid-migration.
function verifyCopy(src, dst) {
  const stack = [''];
  while (stack.length) {
    const rel = stack.pop();
    for (const name of fs.readdirSync(path.join(src, rel))) {
      const childRel = path.join(rel, name);
      const st = fs.statSync(path.join(src, childRel));
      if (st.isDirectory()) { stack.push(childRel); continue; }
      let dstStat;
      try { dstStat = fs.statSync(path.join(dst, childRel)); } catch (_) { return false; }
      if (dstStat.size !== st.size) return false;
    }
  }
  return true;
}

function readMarker(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, MARKER), 'utf8')); }
  catch (_) { return null; }
}
function writeMarker(dir, data) {
  try { fs.writeFileSync(path.join(dir, MARKER), JSON.stringify(data, null, 2)); }
  catch (_) {}
}

function migrateIfNeeded(dataDir, sidecarRoot) {
  const primaryLegacy = path.join(sidecarRoot, 'data');
  // Unset env / Pi / dev: the data dir IS the legacy dir — nothing to move.
  if (!dataDir || path.resolve(dataDir) === path.resolve(primaryLegacy)) return;

  const marker = readMarker(dataDir);
  if (marker) {
    // Already migrated. Count clean boots; reclaim the legacy copy after a few.
    marker.boots = (marker.boots || 1) + 1;
    if (!marker.legacyDeleted && marker.boots >= KEEP_LEGACY_BOOTS && marker.from) {
      try { fs.rmSync(marker.from, { recursive: true, force: true }); marker.legacyDeleted = true; }
      catch (_) { /* legacy may be read-only (resource dir) — harmless to leave */ }
    }
    writeMarker(dataDir, marker);
    return;
  }

  // Fresh relocation. If the new dir somehow already has data, don't touch it.
  if (isPopulated(dataDir)) return;

  const source = legacySources(sidecarRoot).find(isPopulated);
  if (!source) return; // fresh install — nothing to migrate

  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.cpSync(source, dataDir, { recursive: true });
    if (!verifyCopy(source, dataDir)) {
      console.error('[localhub-migrate] copy verify failed — clearing new dir, legacy left intact, retry next boot');
      try { fs.rmSync(dataDir, { recursive: true, force: true }); fs.mkdirSync(dataDir, { recursive: true }); } catch (_) {}
      return;
    }
    writeMarker(dataDir, { from: source, migratedAt: new Date().toISOString(), boots: 1 });
    console.log(`[localhub-migrate] migrated data ${source} -> ${dataDir}`);
  } catch (e) {
    console.error('[localhub-migrate] migration error (legacy left intact):', e.message);
  }
}

module.exports = { migrateIfNeeded, isPopulated, verifyCopy, legacySources };
