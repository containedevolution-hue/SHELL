'use strict';

const fs = require('fs');
const path = require('path');

const MARKER = '.ce-migrated.json';
const KEEP_LEGACY_BOOTS = 3; 

function isPopulated(dir) {
  try {
    return fs.readdirSync(dir).some(e => e === 'pairing.json' || e.startsWith('ce-memories'));
  } catch (_) { return false; }
}

function legacySources(sidecarRoot) {
  const out = [path.join(sidecarRoot, 'data')];
  
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    const m = /^[A-Za-z]:[\\/]?(.*)$/.exec(sidecarRoot);
    if (m) out.push(path.join(process.env.LOCALAPPDATA, 'VirtualStore', m[1], 'data'));
  }
  return out;
}

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
  
  if (!dataDir || path.resolve(dataDir) === path.resolve(primaryLegacy)) return;

  const marker = readMarker(dataDir);
  if (marker) {
    
    marker.boots = (marker.boots || 1) + 1;
    if (!marker.legacyDeleted && marker.boots >= KEEP_LEGACY_BOOTS && marker.from) {
      try { fs.rmSync(marker.from, { recursive: true, force: true }); marker.legacyDeleted = true; }
      catch (_) {  }
    }
    writeMarker(dataDir, marker);
    return;
  }

  if (isPopulated(dataDir)) return;

  const source = legacySources(sidecarRoot).find(isPopulated);
  if (!source) return; 

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
