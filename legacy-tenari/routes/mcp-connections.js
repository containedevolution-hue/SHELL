'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const pool = require('../db');
const tokens = require('../lib/mcp-tokens');

const router = express.Router();
router.use(requireAuth);

const MAX_ACTIVE = 10; 

router.get('/', async (req, res) => {
  try {
    const rows = await tokens.listConnections(pool, req.userId);
    res.json({ connections: rows });
  } catch (err) {
    console.error('[MCP-CONN] list failed:', err.message);
    res.status(500).json({ error: 'Failed to list connections' });
  }
});

router.post('/', async (req, res) => {
  const body = req.body || {};
  if (body.consent !== true) {
    return res.status(400).json({
      error: 'consent_required',
      detail: 'Acknowledge that a connected AI can read your memories before creating a token.',
    });
  }
  const label = body.label ? String(body.label).slice(0, 64) : null;
  
  const requested = Array.isArray(body.scopes) && body.scopes.length ? body.scopes : ['memory:read'];
  const scopes = tokens.sanitizeScopes(requested);
  if (!scopes.length) {
    return res.status(400).json({ error: 'no_valid_scopes', valid: tokens.VALID_SCOPES });
  }
  try {
    const active = (await tokens.listConnections(pool, req.userId)).filter((c) => !c.revoked_at);
    if (active.length >= MAX_ACTIVE) {
      return res.status(409).json({ error: 'too_many_connections', max: MAX_ACTIVE });
    }
    const out = await tokens.createConnection(pool, {
      userId: req.userId, label, scopes, kind: 'companion',
    });
    res.status(201).json({
      token: out.token, 
      connection: {
        id: out.id, label, kind: 'companion', scopes: out.scopes,
        token_prefix: out.prefix, created_at: out.created_at,
      },
      note: 'Copy this token now — it will not be shown again.',
    });
  } catch (err) {
    console.error('[MCP-CONN] mint failed:', err.message);
    res.status(500).json({ error: 'Failed to create connection' });
  }
});

router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad_id' });
  try {
    const ok = await tokens.revokeConnection(pool, { userId: req.userId, id });
    if (!ok) return res.status(404).json({ error: 'not_found' });
    res.json({ revoked: true, id });
  } catch (err) {
    console.error('[MCP-CONN] revoke failed:', err.message);
    res.status(500).json({ error: 'Failed to revoke connection' });
  }
});

module.exports = router;
