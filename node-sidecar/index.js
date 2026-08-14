'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const https = require('https');
const express = require('express');
const PouchDB = require('pouchdb-node');
const expressPouchDB = require('express-pouchdb');
const mcp = require('./mcp/server');
const pairing = require('./lib/pairing');
const { getTunnelUrl } = require('./lib/tunnel-detect');

let flowLocal = null;
try {
  flowLocal = require('./lib/flow-local');
} catch (err) {
  console.warn(`[localhub-sidecar] Flow engine disabled (optional dependency unavailable): ${err.message}`);
}

const { createAssetForgeRouter } = process.env.CE_CONSUMER ? {} : require('./lib/asset-forge');
const { dataDir, SIDECAR_ROOT } = require('./lib/paths');
const { migrateIfNeeded } = require('./lib/migrate-data');
const { readLocalDocs, readLocalDoc } = require('./lib/local-docs');
const accessControl = require('./lib/access');
const { isLoopbackRequest, createScopedTokenGuard, createPairedDatabaseGuard } = require('./lib/scoped-auth');
const { privateNetworkPreflight, createCorsMiddleware } = require('./lib/cors-policy');

const PORT       = parseInt(process.env.LOCALHUB_PORT,       10) || 5984;
const HTTPS_PORT = parseInt(process.env.LOCALHUB_HTTPS_PORT, 10) || 8443;
const CERT_FILE  = path.join(dataDir(), 'hub-cert.json');

const HOST = process.env.LOCALHUB_HOST || '127.0.0.1';
const DATA_DIR = dataDir();

migrateIfNeeded(DATA_DIR, SIDECAR_ROOT);

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const StoreCtor = PouchDB.defaults({ prefix: DATA_DIR + path.sep });

const app = express();

app.use(privateNetworkPreflight);

app.use(createCorsMiddleware());

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

const pairingRouter = express.Router();
pairingRouter.use(express.json({ limit: '64kb' }));

pairingRouter.get('/', (req, res) => {
  res.json({
    url: getTunnelUrl(),
    paired: pairing.isPaired(),
    pairing: 'code_required',
  });
});

pairingRouter.post('/confirm', (req, res) => {
  const { pairing_token, user_id } = req.body || {};
  if (!pairing.matchesToken('identity', pairing_token)) return res.status(403).json({ error: 'bad_token' });
  if (!user_id) return res.status(400).json({ error: 'user_id required' });
  pairing.setUserId(user_id);
  console.log(`[localhub-pairing] bound to user ${user_id}`);
  
  res.json({
    ok: true,
    sync_token: pairing.getSyncToken(),
    mcp_token: pairing.getMcpToken(),
  });
  
  certify().catch(e => console.error('[hub-cert] certify after pair/confirm:', e.message));
});

app.use('/pair', pairingRouter);

const requireSyncToken = createScopedTokenGuard(pairing, 'sync');
const requireMcpToken = createScopedTokenGuard(pairing, 'mcp');
const requirePairedDatabase = createPairedDatabaseGuard(pairing);

app.use('/mcp', requireMcpToken, mcp.mount());

if (flowLocal) {
  app.use('/flow', requireSyncToken, flowLocal.router());
} else {
  console.warn('[localhub-sidecar] /flow route not mounted — Flow engine unavailable in this build');
}

if (!process.env.CE_CONSUMER) {
  app.use('/asset-forge', requireSyncToken, createAssetForgeRouter({ dataDir: DATA_DIR }));
}

app.post('/speak', requireSyncToken, express.json({ limit: '8kb' }), async (req, res) => {
  const text = String((req.body && req.body.text) || '').trim();
  if (!text) return res.status(400).json({ error: 'text_required' });
  try {
    const result = await require('./lib/speaker').speak(text);
    res.json(Object.assign({ ok: true }, result));
  } catch (e) {
    res.status(500).json({ ok: false, error: (e && e.message) || 'speak failed' });
  }
});
app.post('/speak/cancel', requireSyncToken, (_req, res) => {
  require('./lib/speaker').cancel();
  res.json({ ok: true });
});

function loopbackOnly(req, res, next) {
  if (isLoopbackRequest(req)) return next();
  return res.status(403).json({ error: 'loopback_only' });
}
app.use('/access', loopbackOnly, accessControl.router());

app.get('/local/docs', loopbackOnly, async (_req, res) => {
  try {
    res.json(await readLocalDocs(StoreCtor, DATA_DIR));
  } catch (e) {
    res.status(500).json({ error: (e && e.message) || 'read failed' });
  }
});

app.get('/local/docs/:id', loopbackOnly, async (req, res) => {
  try {
    const body = await readLocalDoc(StoreCtor, DATA_DIR, req.params.id);
    if (!body.found) return res.status(404).json(body);
    res.json(body);
  } catch (e) {
    res.status(500).json({ error: (e && e.message) || 'read failed' });
  }
});

app.use('/', requireSyncToken, requirePairedDatabase, expressPouchDB(StoreCtor, {
  mode: 'minimumForPouchDB',
  logPath: path.join(DATA_DIR, 'log.txt'),
  configPath: path.join(DATA_DIR, 'config.json'),
}));

const server = app.listen(PORT, HOST, () => {
  console.log(`[localhub-sidecar] listening on http://${HOST}:${PORT}/`);
  console.log(`[localhub-sidecar] data dir: ${DATA_DIR}`);
  console.log(`[localhub-sidecar] MCP endpoint: http://${HOST}:${PORT}/mcp (shared folders: ${require('./mcp/jail').allowedRoots().length})`);
  console.log(`[localhub-pairing] credential v${pairing.CREDENTIAL_VERSION}; paired: ${pairing.isPaired()}`);
  
  if (pairing.isPaired()) autoRegister().then(() => certify());
  else autoBeacon();
});

const RAILWAY_BASE = 'https://app.tenari.world';

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
      signal: AbortSignal.timeout(120_000), 
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

async function certify() {
  if (HOST === '127.0.0.1') return; 
  let certData = loadCachedCert();
  if (!certData) certData = await provisionCert();
  if (!certData) return;
  startHttpsServer(certData);
  await registerLanUrl(certData.subdomain);
}
const REGISTER_POLL_MS = 5000;
const REGISTER_MAX_POLLS = 18; 

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

  console.log(`[localhub-pairing] Hub not paired — open Settings → Integrations → Hub Appliance`);
  let printedCode = null;

  async function sendBeacon() {
    if (pairing.isPaired()) return; 
    const verifyCode = pairing.getVerifyCode();
    if (verifyCode !== printedCode) {
      printedCode = verifyCode;
      console.log(`[localhub-pairing] Pair code (valid 10 minutes): ${verifyCode}`);
    }
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

function shutdown(signal) {
  console.log(`[localhub-sidecar] ${signal} — shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
