'use strict';

const crypto = require('node:crypto');
const express = require('express');

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const CALLER_SCOPES = Object.freeze({
  main: Object.freeze(['access.mutate', 'app-store.install', 'pairing.manage']),
  'flow-hud': Object.freeze(['sync.invoke']),
});

function secureEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function bearer(req) {
  const value = String(req.headers?.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function createLocalSessionAuthority({ bootstrapToken, now = Date.now, ttlMs = DEFAULT_TTL_MS, randomBytes = crypto.randomBytes } = {}) {
  const bootstrap = bootstrapToken || randomBytes(32).toString('hex');
  if (typeof bootstrap !== 'string' || bootstrap.length < 32) throw new TypeError('local bootstrap token must contain at least 32 characters');
  const sessions = new Map();

  function issue(callerId, requestedScopes) {
    for (const [token, record] of sessions) {
      if (record.revokedAt !== null || now() >= record.expiresAt) sessions.delete(token);
    }
    const allowed = CALLER_SCOPES[callerId];
    if (!allowed || !Array.isArray(requestedScopes) || requestedScopes.length === 0) return { ok: false, status: 403, error: 'caller_not_authorized' };
    const scopes = [...new Set(requestedScopes)];
    if (scopes.some(scope => !allowed.includes(scope))) return { ok: false, status: 403, error: 'scope_not_authorized' };
    const token = randomBytes(32).toString('hex');
    const id = randomBytes(16).toString('hex');
    const issuedAt = now();
    const record = { id, token, callerId, scopes, issuedAt, expiresAt: issuedAt + ttlMs, revokedAt: null, nonces: new Set() };
    sessions.set(token, record);
    return { ok: true, token, sessionId: id, callerId, scopes, issuedAt, expiresAt: record.expiresAt };
  }

  function authenticate(req, scope, { consumeNonce = true } = {}) {
    const token = bearer(req);
    const record = sessions.get(token);
    if (!record || !secureEqual(token, record.token)) return { ok: false, status: 401, error: 'invalid_local_token' };
    if (record.revokedAt !== null) return { ok: false, status: 401, error: 'revoked_local_token' };
    if (now() >= record.expiresAt) return { ok: false, status: 401, error: 'expired_local_token' };
    if (req.get('X-Shell-Caller') !== record.callerId) return { ok: false, status: 403, error: 'caller_mismatch' };
    if (!record.scopes.includes(scope)) return { ok: false, status: 403, error: 'scope_not_authorized' };
    if (consumeNonce) {
      const nonce = req.get('X-Shell-Request-Id');
      if (!nonce || nonce.length > 128) return { ok: false, status: 400, error: 'request_id_required' };
      if (record.nonces.has(nonce)) return { ok: false, status: 409, error: 'replayed_local_request' };
      record.nonces.add(nonce);
    }
    return { ok: true, sessionId: record.id, callerId: record.callerId, scopes: [...record.scopes] };
  }

  function guard(scope, options) {
    return (req, res, next) => {
      const result = authenticate(req, scope, options);
      if (!result.ok) return res.status(result.status).json({ error: result.error });
      req.shellLocalSession = result;
      return next();
    };
  }

  function revoke(sessionId) {
    const record = [...sessions.values()].find(item => item.id === sessionId);
    if (!record || record.revokedAt !== null) return false;
    record.revokedAt = now();
    return true;
  }

  function router() {
    const api = express.Router();
    api.use(express.json({ limit: '4kb' }));
    api.post('/session', (req, res) => {
      if (!secureEqual(req.get('X-Shell-Bootstrap') || '', bootstrap)) return res.status(401).json({ error: 'invalid_bootstrap' });
      const result = issue(req.get('X-Shell-Caller'), req.body?.scopes);
      if (!result.ok) return res.status(result.status).json({ error: result.error });
      return res.json({ contractVersion: 1, token: result.token, sessionId: result.sessionId, callerId: result.callerId, scopes: result.scopes, issuedAt: result.issuedAt, expiresAt: result.expiresAt });
    });
    api.delete('/session/:id', (req, res) => {
      if (!secureEqual(req.get('X-Shell-Bootstrap') || '', bootstrap)) return res.status(401).json({ error: 'invalid_bootstrap' });
      return revoke(req.params.id) ? res.status(204).end() : res.status(404).json({ error: 'local_session_not_found' });
    });
    return api;
  }

  return Object.freeze({ issue, authenticate, guard, revoke, router });
}

module.exports = { createLocalSessionAuthority, CALLER_SCOPES, DEFAULT_TTL_MS };
