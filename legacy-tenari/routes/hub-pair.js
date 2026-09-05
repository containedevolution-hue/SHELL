'use strict';

const crypto = require('crypto');
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const pool = require('../db');
const applianceMcp = require('../lib/appliance-mcp');

const router = express.Router();
const FETCH_TIMEOUT_MS = 5000;

const BEACON_TTL_MS = 5 * 60 * 1000;
const MAX_CLAIM_ATTEMPTS = 5;
const beacons = new Map(); 

function pruneBeacons() {
  const cutoff = Date.now() - BEACON_TTL_MS;
  for (const [id, b] of beacons) {
    if (b.seen_at < cutoff) beacons.delete(id);
  }
}

const beaconRateLimit = new Map(); 

function validCapability(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

async function confirmHub(hubUrl, pairingToken, userId) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${hubUrl}/pair/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pairing_token: pairingToken, user_id: userId }),
      signal: ac.signal,
    });
    if (!response.ok) throw new Error(`confirm_http_${response.status}`);
    const data = await response.json();
    if (!validCapability(data.sync_token) || !validCapability(data.mcp_token)
        || data.sync_token === data.mcp_token || data.sync_token === pairingToken
        || data.mcp_token === pairingToken) {
      throw new Error('invalid_scoped_credentials');
    }
    return { syncToken: data.sync_token, mcpToken: data.mcp_token };
  } finally {
    clearTimeout(timer);
  }
}

router.post('/pair', requireAuth, (_req, res) => {
  res.status(410).json({ error: 'manual_pairing_retired', use: 'beacon_and_local_code' });
});

router.delete('/pair', requireAuth, async (req, res) => {
  await pool.query(
    `UPDATE users
        SET preferences = COALESCE(preferences, '{}'::jsonb)
                          - 'hub_mcp_url'
                          - 'hub_lan_url'
                          - 'hub_pairing_token'
                          - 'hub_sync_token'
                          - 'hub_mcp_token'
      WHERE id = $1`,
    [req.userId]
  );
  res.json({ ok: true });
});

router.post('/register', async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  if (!token) return res.status(401).json({ error: 'Bearer token required' });

  const { hub_mcp_url, hub_lan_url } = req.body || {};
  
  if (!hub_mcp_url && !hub_lan_url) {
    return res.status(400).json({ error: 'hub_mcp_url or hub_lan_url required' });
  }
  if (hub_mcp_url && !hub_mcp_url.startsWith('https://')) {
    return res.status(400).json({ error: 'hub_mcp_url must be https://' });
  }
  if (hub_lan_url && !hub_lan_url.startsWith('https://')) {
    return res.status(400).json({ error: 'hub_lan_url must be https://' });
  }

  const { rows } = await pool.query(
    "SELECT id, preferences FROM users WHERE preferences->>'hub_pairing_token' = $1",
    [token]
  );
  if (!rows.length) return res.status(403).json({ error: 'unknown_token' });

  const { id: userId, preferences: prefs } = rows[0];
  const updates = {};
  if (hub_mcp_url) updates.hub_mcp_url = hub_mcp_url;
  if (hub_lan_url) updates.hub_lan_url  = hub_lan_url;
  await pool.query(
    'UPDATE users SET preferences = $1 WHERE id = $2',
    [{ ...prefs, ...updates }, userId]
  );
  console.log(`[hub-register] user ${userId}`, updates);
  res.json({ ok: true });
});

router.post('/beacon', async (req, res) => {
  const { pairing_token, hub_url, verify_code } = req.body || {};
  if (!pairing_token || typeof pairing_token !== 'string' || pairing_token.length < 8) {
    return res.status(400).json({ error: 'pairing_token required' });
  }
  if (!hub_url || !hub_url.startsWith('https://')) {
    return res.status(400).json({ error: 'hub_url must be https://' });
  }
  if (!verify_code || typeof verify_code !== 'string' || !/^[a-f0-9]{6}$/i.test(verify_code)) {
    return res.status(400).json({ error: 'verify_code must be 6 hex chars' });
  }

  pruneBeacons();

  const lastSeen = beaconRateLimit.get(pairing_token) || 0;
  if (Date.now() - lastSeen < 30000) return res.json({ ok: true });
  beaconRateLimit.set(pairing_token, Date.now());

  let existing = null;
  for (const [id, b] of beacons) {
    if (b.pairing_token === pairing_token) { existing = id; break; }
  }
  if (existing) {
    const b = beacons.get(existing);
    b.hub_url = hub_url;
    const nextCode = verify_code.toUpperCase();
    if (b.verify_code !== nextCode) b.attempts = 0;
    b.verify_code = nextCode;
    b.seen_at = Date.now();
  } else {
    const beaconId = crypto.randomBytes(8).toString('hex');
    beacons.set(beaconId, {
      pairing_token,
      hub_url,
      verify_code: verify_code.toUpperCase(),
      attempts: 0,
      seen_at: Date.now(),
    });
  }
  res.json({ ok: true });
});

router.get('/beacon', requireAuth, async (req, res) => {
  pruneBeacons();

  let pairedToken = null;
  try {
    const { rows } = await pool.query(
      'SELECT preferences FROM users WHERE id = $1',
      [req.userId]
    );
    pairedToken = rows[0]?.preferences?.hub_pairing_token || null;
  } catch (_) {}

  const result = [];
  for (const [beaconId, b] of beacons) {
    if (b.pairing_token === pairedToken) continue; 
    result.push({
      beacon_id: beaconId,
      hub_url: b.hub_url,
      seen_seconds_ago: Math.floor((Date.now() - b.seen_at) / 1000),
    });
  }
  res.json({ beacons: result });
});

router.post('/claim', requireAuth, async (req, res) => {
  const { beacon_id, verify_code } = req.body || {};
  if (!beacon_id || !verify_code || !/^[a-f0-9]{6}$/i.test(String(verify_code))) {
    return res.status(400).json({ error: 'beacon_id and verify_code required' });
  }

  pruneBeacons();
  const beacon = beacons.get(beacon_id);
  if (!beacon) return res.status(404).json({ error: 'beacon_expired' });
  const supplied = String(verify_code).toUpperCase();
  const matches = crypto.timingSafeEqual(Buffer.from(beacon.verify_code), Buffer.from(supplied));
  if (!matches) {
    beacon.attempts = (beacon.attempts || 0) + 1;
    if (beacon.attempts >= MAX_CLAIM_ATTEMPTS) {
      beacons.delete(beacon_id);
      return res.status(429).json({ error: 'too_many_attempts' });
    }
    return res.status(403).json({ error: 'wrong_code' });
  }

  const { pairing_token, hub_url } = beacon;

  let capabilities;
  try {
    capabilities = await confirmHub(hub_url, pairing_token, req.userId);
  } catch (error) {
    console.warn('[hub-claim] sidecar confirmation failed:', error.message);
    return res.status(504).json({ error: 'pairing_confirm_failed' });
  }

  const { rows } = await pool.query(
    'SELECT preferences FROM users WHERE id = $1',
    [req.userId]
  );
  const prefs = rows[0]?.preferences || {};
  await pool.query(
    'UPDATE users SET preferences = $1 WHERE id = $2',
    [{
      ...prefs,
      hub_mcp_url: hub_url,
      hub_pairing_token: pairing_token,
      hub_sync_token: capabilities.syncToken,
      hub_mcp_token: capabilities.mcpToken,
    }, req.userId]
  );

  beacons.delete(beacon_id);
  console.log(`[hub-claim] user ${req.userId} claimed beacon ${beacon_id.slice(0, 8)}…`);
  res.json({ ok: true, hub_url });
});

router.post('/verify', requireAuth, async (req, res) => {
  const cfg = await applianceMcp.getApplianceConfig(req.userId);
  if (cfg.remoteRestricted) return res.status(403).json({ error: 'pass_required' });
  if (!cfg.paired) return res.status(400).json({ error: 'not_paired' });
  if (!cfg.url) return res.status(400).json({ error: 'remote_unavailable' });
  const tools = await applianceMcp.fetchApplianceTools(req.userId);
  if (!tools.length) return res.status(504).json({ error: 'unreachable' });
  res.json({ ok: true, tool_count: tools.length });
});

module.exports = router;
module.exports.confirmHub = confirmHub;
