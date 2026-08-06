'use strict';

const fs = require('fs');
const path = require('path');

const PREFIX = 'ce-memories-';

function discoverUserIds(dataDir) {
  let entries;
  try { entries = fs.readdirSync(dataDir, { withFileTypes: true }); } catch (_) { return []; }
  return entries
    .filter((e) => e.isDirectory() && e.name.startsWith(PREFIX) && e.name.length > PREFIX.length)
    .map((e) => ({ userId: e.name.slice(PREFIX.length), mtimeMs: maxMtimeMs(path.join(dataDir, e.name)) }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .map((e) => e.userId);
}

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
      try { const t = fs.statSync(p).mtimeMs; if (t > max) max = t; } catch (_) {  }
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
