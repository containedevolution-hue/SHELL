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
const cors = require('cors');
const PouchDB = require('pouchdb-node');
const expressPouchDB = require('express-pouchdb');

const PORT = parseInt(process.env.LOCALHUB_PORT, 10) || 5984;
// Default 127.0.0.1 keeps the laptop/Tauri scenario locked to loopback (the
// only legitimate client is the in-process Tauri webview). The Pi appliance
// deployment sets LOCALHUB_HOST=0.0.0.0 so phones/laptops on the LAN can hit
// it directly — only safe on a single-tenant device on a trusted network.
const HOST = process.env.LOCALHUB_HOST || '127.0.0.1';
const DATA_DIR = path.join(__dirname, 'data');

// Ensure data dir exists before PouchDB tries to open / write into it.
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// PouchDB.defaults locks the LevelDB on-disk location for any DB created via
// this constructor (each `new StoreCtor('mydb')` becomes a folder under DATA_DIR).
const StoreCtor = PouchDB.defaults({ prefix: DATA_DIR + path.sep });

const app = express();

// Cyclone C3a — allow the deployed PWA origin (the one loaded inside the
// Tauri webview) to replicate to us. Browsers preflight cross-origin XHR
// (https://app.containedevolution.com → http://localhost:5984), so we have to
// explicitly opt in. v1 list is the prod PWA origins; C3b will swap to a
// token-keyed allowlist when LAN sync ships and we have an actual auth model.
app.use(cors({
  origin: [
    'https://app.containedevolution.com',
    'https://www.containedevolution.com',
  ],
  credentials: false,
}));

// 'minimumForPouchDB' = the subset of the CouchDB HTTP API PouchDB clients
// actually use during replication. Smaller surface, less overhead than
// 'fullCouchDB'; enough for Cyclone (the only client is PouchDB itself).
app.use('/', expressPouchDB(StoreCtor, {
  mode: 'minimumForPouchDB',
  logPath: path.join(DATA_DIR, 'log.txt'),
  configPath: path.join(DATA_DIR, 'config.json'),
}));

const server = app.listen(PORT, HOST, () => {
  console.log(`[localhub-sidecar] listening on http://${HOST}:${PORT}/`);
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
