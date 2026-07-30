'use strict';

// Checks for the offline view's data layer. Run: node lib/local-docs.test.js
const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const PouchDB = require('pouchdb-node');
const { readLocalDocs, discoverUserIds } = require('./local-docs');

(async () => {
  let failures = 0;
  const done = (name, ok, extra) => {
    if (ok) console.log('  ok   -', name);
    else { failures++; console.error('  FAIL -', name, extra !== undefined ? JSON.stringify(extra) : ''); }
  };

  // No ce-memories-* folder at all → known:false, not an error.
  {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-localdocs-empty-'));
    const StoreCtor = PouchDB.defaults({ prefix: emptyDir + path.sep });
    try {
      const r = await readLocalDocs(StoreCtor, emptyDir);
      done('no store folder -> known:false, no docs', r.known === false && r.count === 0);
    } catch (e) { done('empty dir', false, e.message); }
  }

  // discoverUserIds finds nothing on a dir that doesn't exist.
  done('discoverUserIds on a missing dir returns []', discoverUserIds(path.join(os.tmpdir(), 'ce-nope-' + Date.now())).length === 0);

  // Seed a real ce-memories-{userId} folder (mirrors what cyclone-sync writes on
  // this machine — identity comes from disk, NOT Hub-appliance pairing).
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-localdocs-'));
  const StoreCtor = PouchDB.defaults({ prefix: dataDir + path.sep });
  const uid = 'u1';
  const db = new StoreCtor('ce-memories-' + uid);
  await db.put({ _id: 'doc:notes:local-aaa', source: 'notes', type: 'note', title: 'Groceries', body: 'milk, eggs', updated_at: '2026-07-20T00:00:00Z' });
  await db.put({ _id: 'doc:tasks:local-bbb', source: 'tasks', type: 'task', title: 'Call bank', updated_at: '2026-07-25T00:00:00Z' });
  await db.put({ _id: 'mem:should-not-appear', title: 'cloud memory' });

  try {
    const found = discoverUserIds(dataDir);
    done('discoverUserIds finds the seeded folder', found.length === 1 && found[0] === uid, found);
  } catch (e) { done('discoverUserIds', false, e.message); }

  try {
    const r = await readLocalDocs(StoreCtor, dataDir);
    done('known:true, returns only doc:* Local rows', r.known === true && r.count === 2, r.count);
    done('newest first (updated_at desc)', r.docs[0].title === 'Call bank', r.docs.map((d) => d.title));
    done('mem:* excluded', !r.docs.some((d) => String(d.id).startsWith('mem:')));
    const g = r.docs.find((d) => d.title === 'Groceries');
    done('slim shape (type/snippet)', g && g.type === 'note' && g.snippet === 'milk, eggs', g);
  } catch (e) { done('read local docs', false, e.message); }

  // A second, older-written user folder must NOT be merged in — only the most
  // recently active identity is ever shown (never mix two users' local drawers).
  const uid2 = 'u2';
  const db2 = new StoreCtor('ce-memories-' + uid2);
  await db2.put({ _id: 'doc:notes:local-ccc', source: 'notes', type: 'note', title: 'Other user note', updated_at: '2020-01-01T00:00:00Z' });
  // Backdate u2's folder so u1 (touched moments ago, above) stays "most recent".
  const past = new Date('2020-01-01T00:00:00Z');
  fs.utimesSync(path.join(dataDir, 'ce-memories-' + uid2), past, past);
  for (const f of fs.readdirSync(path.join(dataDir, 'ce-memories-' + uid2))) {
    fs.utimesSync(path.join(dataDir, 'ce-memories-' + uid2, f), past, past);
  }

  try {
    const r = await readLocalDocs(StoreCtor, dataDir);
    done('multiple users on disk -> only the most-recent one is read (never merged)',
      r.known === true && r.count === 2 && !r.docs.some((d) => d.title === 'Other user note'), r.docs.map((d) => d.title));
  } catch (e) { done('multi-user isolation', false, e.message); }

  if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
  console.log('\nall local-docs checks passed');
})();
