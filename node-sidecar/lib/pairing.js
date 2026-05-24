'use strict';

// Persistent pairing state for this appliance instance.
// Stored in data/pairing.json next to the sidecar's data directory.
//
// pairing_token — random 32-byte hex string generated on first startup,
//   never changes. Acts as the appliance's identity credential with Railway.
// employee_id   — set via POST /pair/confirm once the user has scanned the
//   QR on their phone and Railway has confirmed the pairing. Null until paired.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PAIRING_FILE = path.join(__dirname, '..', 'data', 'pairing.json');

let _cache = null;

function _load() {
  if (_cache) return _cache;
  try {
    if (fs.existsSync(PAIRING_FILE)) {
      _cache = JSON.parse(fs.readFileSync(PAIRING_FILE, 'utf8'));
      return _cache;
    }
  } catch (_) {}
  _cache = { pairing_token: crypto.randomBytes(32).toString('hex'), employee_id: null };
  _persist(_cache);
  return _cache;
}

function _persist(state) {
  try { fs.writeFileSync(PAIRING_FILE, JSON.stringify(state, null, 2)); } catch (_) {}
}

function getToken()      { return _load().pairing_token; }
function getEmployeeId() { return _load().employee_id || null; }
function isPaired()      { return !!_load().employee_id; }

function setEmployeeId(employeeId) {
  const state = _load();
  state.employee_id = employeeId;
  _persist(state);
  _cache = state;
}

module.exports = { getToken, getEmployeeId, isPaired, setEmployeeId };
