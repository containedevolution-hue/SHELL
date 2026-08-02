'use strict';

// Persistent pairing state for this appliance instance.
// Stored in data/pairing.json next to the sidecar's data directory.
//
// Credentials are deliberately scoped:
//   pairing_token — appliance → Railway identity (never sent to a browser)
//   sync_token    — browser → PouchDB/local-service access
//   mcp_token     — Railway PA → MCP tool access
// user_id is set via POST /pair/confirm after the local verification code is
// claimed. Legacy single-token files are rotated and unpaired on first load;
// the old credential must be treated as disclosed and cannot be carried over.

const crypto = require('crypto');
const fs = require('fs');
const { inData } = require('./paths');

const PAIRING_FILE = inData('pairing.json');
const CREDENTIAL_VERSION = 2;
const VERIFY_CODE_TTL_MS = 10 * 60 * 1000;

let _cache = null;

function _secret() { return crypto.randomBytes(32).toString('hex'); }

function _fresh() {
  return {
    credential_version: CREDENTIAL_VERSION,
    pairing_token: _secret(),
    sync_token: _secret(),
    mcp_token: _secret(),
    verify_code: crypto.randomBytes(3).toString('hex').toUpperCase(),
    verify_code_created_at: Date.now(),
    user_id: null,
  };
}

function _load() {
  if (_cache) return _cache;
  try {
    if (fs.existsSync(PAIRING_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(PAIRING_FILE, 'utf8'));
      if (parsed.credential_version !== CREDENTIAL_VERSION
          || !parsed.pairing_token || !parsed.sync_token || !parsed.mcp_token) {
        _cache = _fresh();
        _persist(_cache);
        return _cache;
      }
      _cache = parsed;
      return _cache;
    }
  } catch (_) {}
  _cache = _fresh();
  _persist(_cache);
  return _cache;
}

function _persist(state) {
  try { fs.writeFileSync(PAIRING_FILE, JSON.stringify(state, null, 2)); } catch (_) {}
}

function getToken()      { return _load().pairing_token; }
function getSyncToken()  { return _load().sync_token; }
function getMcpToken()   { return _load().mcp_token; }
function getUserId() { return _load().user_id || null; }
function isPaired()      { return !!_load().user_id; }

function matchesToken(scope, candidate) {
  const expected = scope === 'sync' ? getSyncToken()
    : scope === 'mcp' ? getMcpToken()
      : getToken();
  if (typeof candidate !== 'string' || candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
}

function getVerifyCode() {
  const state = _load();
  if (state.user_id) return null;
  if (!state.verify_code || !Number.isFinite(state.verify_code_created_at)
      || Date.now() - state.verify_code_created_at >= VERIFY_CODE_TTL_MS) {
    state.verify_code = crypto.randomBytes(3).toString('hex').toUpperCase();
    state.verify_code_created_at = Date.now();
    _persist(state);
    _cache = state;
  }
  return state.verify_code;
}

function setUserId(userId) {
  const state = _load();
  state.user_id = userId;
  state.verify_code = null;
  state.verify_code_created_at = null;
  _persist(state);
  _cache = state;
}

module.exports = {
  CREDENTIAL_VERSION,
  VERIFY_CODE_TTL_MS,
  getToken,
  getSyncToken,
  getMcpToken,
  getUserId,
  isPaired,
  setUserId,
  getVerifyCode,
  matchesToken,
};
