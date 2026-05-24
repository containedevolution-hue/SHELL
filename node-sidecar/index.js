// LocalHub Node sidecar — Cyclone C2b (memory/apps/Cyclone-LocalHub-Conceptual.md)
// + Hub Appliance A2 MCP foundation (memory/apps/CE-Hub-Appliance-Conceptual.md).
//
// Hosts two things on the same Express app:
//   /         — CouchDB-protocol-compatible PouchDB endpoint (Cyclone replication target)
//   /mcp      — Model Context Protocol JSON-RPC endpoint (read-only tool host for the PA)
//
// On a laptop/Tauri install both mount on 127.0.0.1; on the Pi appliance the
// sidecar binds 0.0.0.0 (LOCALHUB_HOST=0.0.0.0) so LAN clients and the cloud
// PA (via tunnel, A3) can reach it.
//
// Storage: a `data/` folder next to this script. Each PouchDB database becomes
// a subfolder; everything's local to this user's machine.
//
// Lifecycle: started by Tauri's spawn_sidecar() in main.rs (laptop) or by the
// `cehub.service` systemd unit on the Pi. Killed by SIGTERM on shutdown.
// Standalone dev:
//   cd localhub/node-sidecar
//   node index.js
//
// Verify (sidecar running):
//   curl http://localhost:5984/                                # PouchDB welcome
//   curl -X POST http://localhost:5984/mcp -H 'content-type: application/json' \
//        -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'   # MCP tool list

'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const PouchDB = require('pouchdb-node');
const expressPouchDB = require('express-pouchdb');
const mcp = require('./mcp/server');

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

// MCP must mount before the PouchDB catch-all on '/'.
app.use('/mcp', mcp.mount());

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
  console.log(`[localhub-sidecar] MCP endpoint: http://${HOST}:${PORT}/mcp (root: ${require('./mcp/jail').ROOT})`);
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
