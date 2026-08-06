'use strict';

const path = require('path');

const SIDECAR_ROOT = path.join(__dirname, '..');

function dataDir() {
  return process.env.LOCALHUB_DATA_DIR || path.join(SIDECAR_ROOT, 'data');
}

function inData(...parts) {
  return path.join(dataDir(), ...parts);
}

module.exports = { dataDir, inData, SIDECAR_ROOT };
