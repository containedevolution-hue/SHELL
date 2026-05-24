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
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const PouchDB = require('pouchdb-node');
const expressPouchDB = require('express-pouchdb');
const mcp = require('./mcp/server');
const pairing = require('./lib/pairing');
const { getTunnelUrl } = require('./lib/tunnel-detect');

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

// Allow the deployed PWA origin + future LAN origins. C3b-2 (true LAN sync)
// will extend this to token-keyed per-device allowlist. Private Network
// Access header added so Chrome on Android can reach us over HTTP while
// the phone is on the same LAN (PNA draft spec — Chrome 98+).
app.use(cors({
  origin: [
    'https://app.containedevolution.com',
    'https://www.containedevolution.com',
  ],
  credentials: false,
}));
app.use((req, res, next) => {
  // PNA preflight — lets Chrome on Android bypass the mixed-content block
  // for private-network (LAN) addresses when the PWA is HTTPS.
  if (req.method === 'OPTIONS' && req.headers['access-control-request-private-network']) {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
  next();
});

// ── Pairing routes (no token auth — bootstrap surface) ───────────────────────

const pairingRouter = express.Router();
pairingRouter.use(express.json({ limit: '64kb' }));

// GET /pair — returns pairing_token + current tunnel URL.
// The phone reads this once to bootstrap; no auth required because the token
// alone is useless without the user's Railway session to bind it to.
pairingRouter.get('/', (req, res) => {
  res.json({
    pairing_token: pairing.getToken(),
    url: getTunnelUrl(),
    paired: pairing.isPaired(),
  });
});

// POST /pair/confirm — called by Railway (proxied through the phone) after
// a successful /api/hub/pair to bind the sidecar to an employee.
// Validated by the pairing token in the body.
pairingRouter.post('/confirm', (req, res) => {
  const { pairing_token, employee_id } = req.body || {};
  if (pairing_token !== pairing.getToken()) return res.status(403).json({ error: 'bad_token' });
  if (!employee_id) return res.status(400).json({ error: 'employee_id required' });
  pairing.setEmployeeId(employee_id);
  console.log(`[localhub-pairing] bound to employee ${employee_id}`);
  res.json({ ok: true });
});

app.use('/pair', pairingRouter);

// ── MCP — requires Bearer pairing token once device is paired ────────────────

function requirePairingToken(req, res, next) {
  // Skip auth if the device hasn't been paired yet — lets the initial
  // A4 verify step work before the user completes the pairing flow.
  if (!pairing.isPaired()) return next();
  const auth = req.headers.authorization || '';
  if (auth === `Bearer ${pairing.getToken()}`) return next();
  return res.status(401).json({ error: 'invalid_token' });
}

// MCP must mount before the PouchDB catch-all on '/'.
app.use('/mcp', requirePairingToken, mcp.mount());

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
  console.log(`[localhub-pairing] token: ${pairing.getToken().slice(0, 8)}… paired: ${pairing.isPaired()}`);
  // Auto-register (paired) or beacon (unpaired) on every boot.
  // Both poll for the cloudflared tunnel URL before acting.
  if (pairing.isPaired()) autoRegister();
  else autoBeacon();
});

// Auto-register: poll for the cloudflared tunnel URL then POST to Railway so
// the phone's preferences always have the latest URL without any manual step.
const RAILWAY_BASE = 'https://app.containedevolution.com';
const REGISTER_POLL_MS = 5000;
const REGISTER_MAX_POLLS = 18; // 90s total — tunnel can be slow on cold boot

async function autoRegister() {
  let tunnelUrl = null;
  for (let i = 0; i < REGISTER_MAX_POLLS; i++) {
    await new Promise(r => setTimeout(r, REGISTER_POLL_MS));
    tunnelUrl = getTunnelUrl();
    if (tunnelUrl) break;
  }
  if (!tunnelUrl) {
    console.log('[localhub-pairing] auto-register skipped — no tunnel URL after 90s');
    return;
  }
  try {
    const res = await fetch(`${RAILWAY_BASE}/api/hub/register`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${pairing.getToken()}`,
      },
      body: JSON.stringify({ hub_mcp_url: tunnelUrl }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      console.log(`[localhub-pairing] auto-registered: ${tunnelUrl}`);
    } else {
      console.log(`[localhub-pairing] auto-register failed: ${res.status}`);
    }
  } catch (err) {
    console.log(`[localhub-pairing] auto-register error: ${err.message}`);
  }
}

// Auto-beacon: when unpaired, broadcast presence to Railway so the user's
// Settings page can detect the device and prompt for the verify code.
// Generates a random 6-char code each boot — only way to claim the device.
const BEACON_INTERVAL_MS = 60000;

async function autoBeacon() {
  let tunnelUrl = null;
  for (let i = 0; i < REGISTER_MAX_POLLS; i++) {
    await new Promise(r => setTimeout(r, REGISTER_POLL_MS));
    tunnelUrl = getTunnelUrl();
    if (tunnelUrl) break;
  }
  if (!tunnelUrl) {
    console.log('[localhub-pairing] beacon skipped — no tunnel URL after 90s');
    return;
  }

  const verifyCode = crypto.randomBytes(3).toString('hex').toUpperCase();
  console.log(`[localhub-pairing] Hub not paired — open Settings → Integrations → Hub Appliance`);
  console.log(`[localhub-pairing] Pair code: ${verifyCode}`);

  async function sendBeacon() {
    if (pairing.isPaired()) return; // stop beaconing once claimed
    try {
      await fetch(`${RAILWAY_BASE}/api/hub/beacon`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          pairing_token: pairing.getToken(),
          hub_url: getTunnelUrl() || tunnelUrl,
          verify_code: verifyCode,
        }),
        signal: AbortSignal.timeout(8000),
      });
    } catch (_) {}
  }

  await sendBeacon();
  const iv = setInterval(async () => {
    if (pairing.isPaired()) { clearInterval(iv); return; }
    await sendBeacon();
  }, BEACON_INTERVAL_MS);
}

// Tauri's main.rs sends a kill signal on ExitRequested. Graceful close + a
// short force-exit fallback so we never leave a zombie holding port 5984.
function shutdown(signal) {
  console.log(`[localhub-sidecar] ${signal} — shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
