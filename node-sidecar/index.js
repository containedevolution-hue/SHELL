// LocalHub Node sidecar — Cyclone C2b (memory/apps/Cyclone-LocalHub-Conceptual.md).
//
// Spawned by Tauri's main.rs at app startup; runs a CouchDB-protocol-compatible
// HTTP host on http://localhost:5984/ via express-pouchdb + PouchDB's Node
// adapter (LevelDB-backed persistence). This is what the PWA's PouchDB clients
// will replicate to in C3. The sidecar itself doesn't initiate sync — it just
// stands there as the host endpoint.
//
// Storage: a `data/` folder next to this script. Each PouchDB database becomes
// a subfolder; everything's local to this user's machine.
//
// Lifecycle: started by Tauri's spawn_sidecar() in main.rs, killed on app exit
// via RunEvent::ExitRequested. Can also be run standalone for development:
//   cd localhub/node-sidecar
//   node index.js
//
// Verify (with the sidecar running):
//   curl http://localhost:5984/
//   -> {"couchdb":"Welcome","version":"...","vendor":{"name":"PouchDB-Server"}}

'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const PouchDB = require('pouchdb-node');
const expressPouchDB = require('express-pouchdb');

const PORT = parseInt(process.env.LOCALHUB_PORT, 10) || 5984;
const DATA_DIR = path.join(__dirname, 'data');

// Ensure data dir exists before PouchDB tries to open / write into it.
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// PouchDB.defaults locks the LevelDB on-disk location for any DB created via
// this constructor (each `new StoreCtor('mydb')` becomes a folder under DATA_DIR).
const StoreCtor = PouchDB.defaults({ prefix: DATA_DIR + path.sep });

const app = express();

// 'minimumForPouchDB' = the subset of the CouchDB HTTP API PouchDB clients
// actually use during replication. Smaller surface, less overhead than
// 'fullCouchDB'; enough for Cyclone (the only client is PouchDB itself).
app.use('/', expressPouchDB(StoreCtor, {
  mode: 'minimumForPouchDB',
  logPath: path.join(DATA_DIR, 'log.txt'),
  configPath: path.join(DATA_DIR, 'config.json'),
}));

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`[localhub-sidecar] listening on http://localhost:${PORT}/`);
  console.log(`[localhub-sidecar] data dir: ${DATA_DIR}`);
});

// Tauri's main.rs sends a kill signal on ExitRequested. Graceful close + a
// short force-exit fallback so we never leave a zombie holding port 5984.
function shutdown(signal) {
  console.log(`[localhub-sidecar] ${signal} — shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
