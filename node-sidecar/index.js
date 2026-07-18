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
const os = require('os');
const https = require('https');
const express = require('express');
const cors = require('cors');
const PouchDB = require('pouchdb-node');
const expressPouchDB = require('express-pouchdb');
const mcp = require('./mcp/server');
const pairing = require('./lib/pairing');
const { getTunnelUrl } = require('./lib/tunnel-detect');
const flowLocal = require('./lib/flow-local');

const PORT       = parseInt(process.env.LOCALHUB_PORT,       10) || 5984;
const HTTPS_PORT = parseInt(process.env.LOCALHUB_HTTPS_PORT, 10) || 8443;
const CERT_FILE  = path.join(__dirname, 'data', 'hub-cert.json');
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
    // Flow HUD: the Tauri desktop HUD is a local page that POSTs the local
    // engine (/flow) cross-origin to this loopback sidecar. Its webview origin
    // is tauri://localhost (macOS/Linux) / http(s)://tauri.localhost (Windows).
    'tauri://localhost',
    'http://tauri.localhost',
    'https://tauri.localhost',
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

// ── Cyclone C2.1b — Google OAuth loopback callback ───────────────────────────
//
// Google's installed-app OAuth policy: Desktop clients can use a loopback IP
// redirect (http://127.0.0.1:PORT/...) WITHOUT registering the URI on the
// client config (which custom URI schemes now require, and the Cloud Console
// Desktop-client UI provides no field for anyway). We accept the redirect
// here, then bounce to the Tauri custom-scheme `com.containedevolution.localhub:/...`
// so the existing in-Tauri deep-link → PWA event listener pipeline still
// carries the `code` + `state` into the webview. Loopback satisfies Google;
// custom scheme handles the Tauri hop. No auth on this route — Google sends
// the request unauthenticated by design; the `code` is PKCE-protected and
// `state` is checked PWA-side before any exchange.
app.get('/oauth/callback', (req, res) => {
  const qs = req.originalUrl.split('?')[1] || '';
  const customUrl = 'com.containedevolution.localhub:/oauth/callback' + (qs ? '?' + qs : '');
  res.set('Content-Type', 'text/html').send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Signing in to Contained Evolution…</title></head>
<body style="background:#0a0e1a;color:#d9e1f2;font-family:system-ui,sans-serif;text-align:center;padding:48px;">
  <h2>Returning to LocalHub…</h2>
  <p>You can close this tab.</p>
  <script>
    location.replace(${JSON.stringify(customUrl)});
    setTimeout(function(){
      var a=document.createElement('a');
      a.href=${JSON.stringify(customUrl)};
      a.textContent='Click here if LocalHub didn\\'t open automatically';
      a.style.color='#5bc0eb';
      document.body.appendChild(a);
    },1500);
  </script>
</body></html>`);
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
// a successful /api/hub/pair to bind the sidecar to an user.
// Validated by the pairing token in the body.
pairingRouter.post('/confirm', (req, res) => {
  const { pairing_token, user_id } = req.body || {};
  if (pairing_token !== pairing.getToken()) return res.status(403).json({ error: 'bad_token' });
  if (!user_id) return res.status(400).json({ error: 'user_id required' });
  pairing.setUserId(user_id);
  console.log(`[localhub-pairing] bound to user ${user_id}`);
  res.json({ ok: true });
  // Kick off cert provision in the background — first-time pairing.
  certify().catch(e => console.error('[hub-cert] certify after pair/confirm:', e.message));
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

// Flow's NO-API engine — whisper.cpp STT + local Ollama cleanup. Mounts before
// the PouchDB catch-all (like /mcp). No pairing token: loopback-only on a
// laptop/Tauri, single-tenant on the Pi — same trust as the store itself.
app.use('/flow', flowLocal.router());

// Plain HTTP twin of the `speak` MCP tool, for a browser client that can't
// speak the MCP JSON-RPC protocol (the hub kiosk page). Same engine (Piper ->
// aplay on the pinned ALSA device), same loopback/single-tenant trust as
// /flow above — deliberately not behind the pairing token. Unlike the MCP
// tool (fire-and-forget, so the PA tool-loop isn't blocked), this AWAITS
// playback finishing before responding — the hub's turn-taking needs to know
// when speech actually ends, not just that it started.
app.post('/speak', express.json({ limit: '8kb' }), async (req, res) => {
  const text = String((req.body && req.body.text) || '').trim();
  if (!text) return res.status(400).json({ error: 'text_required' });
  try {
    const result = await require('./lib/speaker').speak(text);
    res.json(Object.assign({ ok: true }, result));
  } catch (e) {
    res.status(500).json({ ok: false, error: (e && e.message) || 'speak failed' });
  }
});
app.post('/speak/cancel', (_req, res) => {
  require('./lib/speaker').cancel();
  res.json({ ok: true });
});

// 'minimumForPouchDB' = the subset of the CouchDB HTTP API PouchDB clients
// actually use during replication. Smaller surface, less overhead than
// 'fullCouchDB'; enough for Cyclone (the only client is PouchDB itself).
//
// Ledger #6: gate the store behind the pairing token (same as /mcp) so a paired
// hub — which binds 0.0.0.0 and can front a public tunnel — no longer exposes
// every ce-memories-{userId} DB by name. An UNPAIRED hub stays open (bootstrap /
// loopback-only), so this changes nothing until the hub is paired. Clients send
// `Authorization: Bearer <pairing_token>` via the cyclone-sync.js fetch hook.
app.use('/', requirePairingToken, expressPouchDB(StoreCtor, {
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
  if (pairing.isPaired()) autoRegister().then(() => certify());
  else autoBeacon();
});

// ── LAN HTTPS cert provisioning (C3b-2 / A5c) ────────────────────────────────
// On every boot (if paired), the sidecar asks Railway to provision/renew a
// 90-day Let's Encrypt cert for its UUID subdomain (*.hub.containedevolution.com),
// then starts an HTTPS listener on port 8443 with that cert.  This makes the
// sidecar reachable over HTTPS on the LAN so both iOS and Android PWAs can run
// PouchDB sync without the mixed-content block.
//
// Skipped on loopback-only installs (laptop/Tauri default) — the localhost
// exception already covers those; only the Pi (HOST=0.0.0.0) needs this.

const RAILWAY_BASE = 'https://app.containedevolution.com';

function getLanIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}

function loadCachedCert() {
  try {
    if (!fs.existsSync(CERT_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(CERT_FILE, 'utf8'));
    // Consider stale within 30 days of expiry so we re-provision proactively.
    if (new Date(data.expires_at) < new Date(Date.now() + 30 * 86400_000)) return null;
    return data;
  } catch { return null; }
}

async function provisionCert() {
  const lanIp = getLanIp();
  if (!lanIp) {
    console.warn('[hub-cert] no LAN IP detected — skipping provision');
    return null;
  }
  try {
    console.log(`[hub-cert] provisioning cert for LAN IP ${lanIp} …`);
    const res = await fetch(`${RAILWAY_BASE}/api/hub/provision`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${pairing.getToken()}`,
      },
      body: JSON.stringify({ lan_ip: lanIp }),
      signal: AbortSignal.timeout(120_000), // ACME DNS-01 round-trip takes ~45s
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[hub-cert] provision failed ${res.status}:`, err.error || '');
      return null;
    }
    const data = await res.json();
    fs.writeFileSync(CERT_FILE, JSON.stringify({ ...data, lan_ip: lanIp }));
    console.log(`[hub-cert] cert provisioned: ${data.subdomain} (expires ${data.expires_at})`);
    return data;
  } catch (err) {
    console.error('[hub-cert] provision error:', err.message);
    return null;
  }
}

let httpsServer = null;
function startHttpsServer(certData) {
  if (httpsServer) { httpsServer.close(); httpsServer = null; }
  try {
    httpsServer = https.createServer({ cert: certData.cert_pem, key: certData.key_pem }, app);
    httpsServer.listen(HTTPS_PORT, HOST, () => {
      console.log(`[hub-cert] HTTPS listening on ${HOST}:${HTTPS_PORT}`);
      console.log(`[hub-cert] LAN HTTPS URL: https://${certData.subdomain}:${HTTPS_PORT}`);
    });
  } catch (err) {
    console.error('[hub-cert] failed to start HTTPS server:', err.message);
  }
}

// After getting a cert, tell Railway the LAN HTTPS URL so the phone can use it.
async function registerLanUrl(subdomain) {
  try {
    const lanUrl = `https://${subdomain}:${HTTPS_PORT}`;
    const res = await fetch(`${RAILWAY_BASE}/api/hub/register`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${pairing.getToken()}`,
      },
      body: JSON.stringify({ hub_lan_url: lanUrl }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) console.log(`[hub-cert] hub_lan_url registered: ${lanUrl}`);
    else console.warn('[hub-cert] hub_lan_url register failed:', res.status);
  } catch (err) {
    console.warn('[hub-cert] hub_lan_url register error:', err.message);
  }
}

// Full cert lifecycle: provision (or use cached), start HTTPS, register URL.
// Only runs on LAN-bound installs (HOST !== loopback).
async function certify() {
  if (HOST === '127.0.0.1') return; // laptop/Tauri — localhost exception covers it
  let certData = loadCachedCert();
  if (!certData) certData = await provisionCert();
  if (!certData) return;
  startHttpsServer(certData);
  await registerLanUrl(certData.subdomain);
}
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

  const verifyCode = pairing.getVerifyCode();
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
