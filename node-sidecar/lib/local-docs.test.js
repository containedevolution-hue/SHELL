'use strict';

const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const PouchDB = require('pouchdb-node');
const { readLocalDocs, readLocalDoc, discoverUserIds } = require('./local-docs');

(async () => {
  let failures = 0;
  const done = (name, ok, extra) => {
    if (ok) console.log('  ok   -', name);
    else { failures++; console.error('  FAIL -', name, extra !== undefined ? JSON.stringify(extra) : ''); }
  };

  {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-localdocs-empty-'));
    const StoreCtor = PouchDB.defaults({ prefix: emptyDir + path.sep });
    try {
      const r = await readLocalDocs(StoreCtor, emptyDir);
      done('no store folder -> known:false, no docs', r.known === false && r.count === 0);
    } catch (e) { done('empty dir', false, e.message); }
  }

  done('discoverUserIds on a missing dir returns []', discoverUserIds(path.join(os.tmpdir(), 'ce-nope-' + Date.now())).length === 0);

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

  const uid2 = 'u2';
  const db2 = new StoreCtor('ce-memories-' + uid2);
  await db2.put({ _id: 'doc:notes:local-ccc', source: 'notes', type: 'note', title: 'Other user note', updated_at: '2020-01-01T00:00:00Z' });
  
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

  try {
    const r = await readLocalDoc(StoreCtor, dataDir, 'doc:notes:local-aaa');
    done('readLocalDoc returns the whole body, not a snippet',
      r.found === true && r.doc.text === 'milk, eggs' && r.doc.title === 'Groceries', r.doc);
  } catch (e) { done('readLocalDoc', false, e.message); }

  try {
    const r = await readLocalDoc(StoreCtor, dataDir, 'mem:should-not-appear');
    done('readLocalDoc refuses a cloud mem:* id', r.found === false && r.doc === null, r);
  } catch (e) { done('readLocalDoc mem:* refusal', false, e.message); }

  try {
    const r = await readLocalDoc(StoreCtor, dataDir, '_local/anything');
    done('readLocalDoc refuses a non-doc id', r.found === false && r.doc === null, r);
  } catch (e) { done('readLocalDoc non-doc refusal', false, e.message); }

  try {
    const r = await readLocalDoc(StoreCtor, dataDir, 'doc:notes:missing');
    done('readLocalDoc reports a missing doc without throwing', r.known === true && r.found === false, r);
  } catch (e) { done('readLocalDoc missing', false, e.message); }

  try {
    const r = await readLocalDoc(StoreCtor, dataDir, 'doc:notes:local-ccc');
    done('readLocalDoc cannot reach another user\'s store', r.found === false, r);
  } catch (e) { done('readLocalDoc cross-user', false, e.message); }

  if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
  console.log('\nall local-docs checks passed');
})();
