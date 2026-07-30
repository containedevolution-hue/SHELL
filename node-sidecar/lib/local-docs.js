'use strict';

// Read the user's Local-drawer docs straight from the on-disk PouchDB — the data
// behind the offline view. Read-only, slim projection. Same per-user DB as the
// Memory Bank (`ce-memories-{userId}`); the Local drawer is the `doc:{source}:local-*`
// rows (see public/js/doc-store.js: _id `doc:{source}:{localId}`, localId `local-*`).
//
// IDENTITY: which user's DB to read is NOT the Hub-appliance pairing state
// (lib/pairing.js) — that tracks a separate remote-tunnel concept and is often
// false even when the app is fully logged in and syncing locally. Instead this
// discovers identity from disk: `/memory/js/cyclone-sync.js` already replicates
// the logged-in user's data into a `ce-memories-{userId}` folder here via
// same-machine sync (Tenari-Command-Center.md "Same-machine replication"), so
// that folder's mere existence IS the signal. If more than one ever exists
// (a second account once used this box), the most recently written one wins —
// never merge two users' local drawers together.

const fs = require('fs');
const path = require('path');

const PREFIX = 'ce-memories-';

// Newest-first list of userIds with a store folder under dataDir.
function discoverUserIds(dataDir) {
  let entries;
  try { entries = fs.readdirSync(dataDir, { withFileTypes: true }); } catch (_) { return []; }
  return entries
    .filter((e) => e.isDirectory() && e.name.startsWith(PREFIX) && e.name.length > PREFIX.length)
    .map((e) => ({ userId: e.name.slice(PREFIX.length), mtimeMs: maxMtimeMs(path.join(dataDir, e.name)) }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .map((e) => e.userId);
}

// Latest mtime of any file under dir — a folder-level mtime alone can miss an
// in-place append to an existing LevelDB .log file, so this walks the files.
function maxMtimeMs(dir) {
  let max = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { continue; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { stack.push(p); continue; }
      try { const t = fs.statSync(p).mtimeMs; if (t > max) max = t; } catch (_) { /* skip */ }
    }
  }
  return max;
}

async function readLocalDocs(StoreCtor, dataDir) {
  const [userId] = discoverUserIds(dataDir);
  if (!userId) return { known: false, count: 0, docs: [] };
  const db = new StoreCtor(PREFIX + userId);
  const res = await db.allDocs({ include_docs: true, startkey: 'doc:', endkey: 'doc:￿' });
  const docs = res.rows
    .map((r) => r.doc)
    .filter(Boolean)
    .map(slim)
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  return { known: true, count: docs.length, docs };
}

function slim(d) {
  const text = d.body || d.text || d.content || d.note || '';
  return {
    id: d._id,
    source: d.source || null,
    type: d.type || d.source || 'note',
    title: d.title || d.name || '(untitled)',
    snippet: String(text).slice(0, 200),
    updated_at: d.updated_at || d.created_at || null,
  };
}

module.exports = { readLocalDocs, discoverUserIds, slim };
