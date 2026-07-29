'use strict';

// Checks for the offline view's data layer. Run: node lib/local-docs.test.js
const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const PouchDB = require('pouchdb-node');
const { readLocalDocs } = require('./local-docs');

(async () => {
  let failures = 0;
  const done = (name, ok, extra) => {
    if (ok) console.log('  ok   -', name);
    else { failures++; console.error('  FAIL -', name, extra !== undefined ? JSON.stringify(extra) : ''); }
  };

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-localdocs-'));
  const StoreCtor = PouchDB.defaults({ prefix: tmp + path.sep });

  // Unpaired (no userId) → nothing, not an error.
  try {
    const r = await readLocalDocs(StoreCtor, null);
    done('unpaired → paired:false, no docs', r.paired === false && r.count === 0);
  } catch (e) { done('unpaired', false, e.message); }

  // Seed the per-user DB: two Local docs + one Memory Bank row that must be excluded.
  const uid = 'u1';
  const db = new StoreCtor('ce-memories-' + uid);
  await db.put({ _id: 'doc:notes:local-aaa', source: 'notes', type: 'note', title: 'Groceries', body: 'milk, eggs', updated_at: '2026-07-20T00:00:00Z' });
  await db.put({ _id: 'doc:tasks:local-bbb', source: 'tasks', type: 'task', title: 'Call bank', updated_at: '2026-07-25T00:00:00Z' });
  await db.put({ _id: 'mem:should-not-appear', title: 'cloud memory' });

  try {
    const r = await readLocalDocs(StoreCtor, uid);
    done('returns only doc:* Local rows', r.paired === true && r.count === 2, r.count);
    done('newest first (updated_at desc)', r.docs[0].title === 'Call bank', r.docs.map((d) => d.title));
    done('mem:* excluded', !r.docs.some((d) => String(d.id).startsWith('mem:')));
    const g = r.docs.find((d) => d.title === 'Groceries');
    done('slim shape (type/snippet)', g && g.type === 'note' && g.snippet === 'milk, eggs', g);
  } catch (e) { done('read local docs', false, e.message); }

  if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
  console.log('\nall local-docs checks passed');
})();
