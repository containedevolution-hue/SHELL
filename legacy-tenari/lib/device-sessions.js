'use strict';

const crypto = require('crypto');
const pool = require('../db');

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEVICE_KINDS = new Set(['phone', 'desktop', 'tablet', 'unknown']);

function cleanText(value, max) {
  return String(value == null ? '' : value).trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
}

function isUuid(value) {
  return UUID_RE.test(String(value || ''));
}

function defaultDeviceName(kind) {
  if (kind === 'phone') return 'Phone';
  if (kind === 'tablet') return 'Tablet';
  if (kind === 'desktop') return 'Desktop';
  return 'Unknown device';
}

function sanitizeDeviceMetadata(raw, userAgent) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const rawKind = cleanText(source.kind, 20).toLowerCase();
  const kind = DEVICE_KINDS.has(rawKind) ? rawKind : 'unknown';
  const installationId = cleanText(source.id, 128);
  const installationIdHash = installationId
    ? crypto.createHash('sha256').update(installationId, 'utf8').digest('hex')
    : null;
  return {
    installationIdHash,
    kind,
    name:cleanText(source.name, 80) || defaultDeviceName(kind),
    userAgent:cleanText(userAgent, 512) || null,
  };
}

async function createDeviceSession({ userId, device, userAgent, now = new Date() }) {
  const id = crypto.randomUUID();
  const meta = sanitizeDeviceMetadata(device, userAgent);
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  const { rows } = await pool.query(
    `INSERT INTO auth_device_sessions
       (id, user_id, installation_id_hash, device_name, device_kind, user_agent,
        created_at, last_seen_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8)
     RETURNING id, device_name, device_kind, created_at, last_seen_at, expires_at`,
    [id, userId, meta.installationIdHash, meta.name, meta.kind, meta.userAgent, now, expiresAt]
  );
  return rows[0];
}

async function revokeDeviceSession(userId, sessionId, reason = 'user_revoke') {
  if (!isUuid(sessionId)) return null;
  const { rows } = await pool.query(
    `UPDATE auth_device_sessions
        SET revoked_at = COALESCE(revoked_at, NOW()),
            revoked_reason = COALESCE(revoked_reason, $3)
      WHERE id = $1 AND user_id = $2
      RETURNING id, revoked_at`,
    [sessionId, userId, cleanText(reason, 40) || 'user_revoke']
  );
  return rows[0] || null;
}

async function revokeAllDeviceSessions(userId, reason = 'account_suspended') {
  const { rows } = await pool.query(
    `UPDATE auth_device_sessions
        SET revoked_at = COALESCE(revoked_at, NOW()),
            revoked_reason = COALESCE(revoked_reason, $2)
      WHERE user_id = $1 AND revoked_at IS NULL
      RETURNING id`,
    [userId, cleanText(reason, 40) || 'account_suspended']
  );
  return rows.length;
}

module.exports = {
  SESSION_TTL_MS,
  isUuid,
  sanitizeDeviceMetadata,
  createDeviceSession,
  revokeDeviceSession,
  revokeAllDeviceSessions,
};
