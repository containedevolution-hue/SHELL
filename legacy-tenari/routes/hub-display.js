'use strict';

const express = require('express');
const jwt     = require('jsonwebtoken');
const pool    = require('../db');

const router = express.Router();

const DISPLAY_TOKEN_EXPIRY = '365d';
const DISPLAY_TOKEN_AUD    = 'hub-display';

async function resolvePairingToken(req, res) {
  const raw = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!raw) { res.status(401).json({ error: 'missing_token' }); return null; }
  const { rows } = await pool.query(
    "SELECT id FROM users WHERE preferences->>'hub_pairing_token' = $1",
    [raw]
  );
  if (!rows.length) { res.status(403).json({ error: 'unknown_token' }); return null; }
  return rows[0].id;
}

function resolveDisplayToken(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
    || (req.query.dt || '');
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { audience: DISPLAY_TOKEN_AUD });
    return decoded.id || null;
  } catch { return null; }
}

router.post('/display-token', async (req, res) => {
  try {
    const userId = await resolvePairingToken(req, res);
    if (!userId) return;
    const token = jwt.sign(
      { id: userId },
      process.env.JWT_SECRET,
      { expiresIn: DISPLAY_TOKEN_EXPIRY, audience: DISPLAY_TOKEN_AUD }
    );
    res.json({ display_token: token, expires_in: DISPLAY_TOKEN_EXPIRY });
  } catch (err) {
    console.error('[hub-display] token:', err.message);
    res.status(500).json({ error: 'token_failed' });
  }
});

router.post('/chat/auth-bridge', async (req, res) => {
  const userId = resolveDisplayToken(req);
  if (!userId) return res.status(401).json({ error: 'invalid_token' });
  try {
    const bridge = jwt.sign(
      { id: userId },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    res.json({ token: bridge, expires_in: 3600 });
  } catch (err) {
    console.error('[hub-display] chat-auth-bridge:', err.message);
    res.status(500).json({ error: 'bridge_failed' });
  }
});

module.exports = router;
