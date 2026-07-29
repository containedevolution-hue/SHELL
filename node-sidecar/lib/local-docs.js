'use strict';

// Read the user's Local-drawer docs straight from the on-disk PouchDB — the data
// behind the offline view. Read-only, slim projection. Same per-user DB as the
// Memory Bank (`ce-memories-{userId}`); the Local drawer is the `doc:{source}:local-*`
// rows (see public/js/doc-store.js: _id `doc:{source}:{localId}`, localId `local-*`).

async function readLocalDocs(StoreCtor, userId) {
  if (!userId) return { paired: false, count: 0, docs: [] };
  const db = new StoreCtor('ce-memories-' + userId);
  const res = await db.allDocs({ include_docs: true, startkey: 'doc:', endkey: 'doc:￿' });
  const docs = res.rows
    .map((r) => r.doc)
    .filter(Boolean)
    .map(slim)
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  return { paired: true, count: docs.length, docs };
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

module.exports = { readLocalDocs, slim };
