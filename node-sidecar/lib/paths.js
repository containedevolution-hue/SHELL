'use strict';

// Single source of truth for the sidecar's writable data directory.
//
// The desktop (Tauri) sets LOCALHUB_DATA_DIR to a per-user appLocalDataDir path
// so user data — the PouchDB store, pairing token, certs, whisper model, keys —
// survives app updates: an installer/updater replaces the resource dir, so the
// store must NOT live beside this script there. When the env is unset — the Pi
// appliance and standalone dev — it falls back to the historical `data/` folder
// next to the sidecar, leaving those deployments byte-for-byte unchanged.
//
// Everything that persists must resolve through here (or through the specific
// override envs Rust also sets: WHISPER_MODEL_DIR, ELEVENLABS_KEY_FILE,
// WHISPER_BIN) so a single relocation moves the whole data set together — no
// split-brain where the store moves but pairing.json stays behind and the box
// silently unpairs on the next update.

const path = require('path');

// This file lives in node-sidecar/lib/, so the sidecar root is one dir up.
const SIDECAR_ROOT = path.join(__dirname, '..');

// Read the env on each call so a value set after module load is still honored.
function dataDir() {
  return process.env.LOCALHUB_DATA_DIR || path.join(SIDECAR_ROOT, 'data');
}

function inData(...parts) {
  return path.join(dataDir(), ...parts);
}

module.exports = { dataDir, inData, SIDECAR_ROOT };
