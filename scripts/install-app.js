'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { installRelease } = require('../node-sidecar/lib/app-install');
const { dataDir } = require('../node-sidecar/lib/paths');
const [file, expectedHash, destination] = process.argv.slice(2);
if (!file || !expectedHash) {
  console.error('Usage: node scripts/install-app.js RELEASE.ceapp.json TRUSTED_SHA256 [APPS_DIRECTORY]');
  process.exitCode = 1;
} else {
  try {
    if (fs.statSync(file).size > 20 * 1024 * 1024) throw new Error('Release exceeds size limit');
    console.log(JSON.stringify(installRelease(fs.readFileSync(file), expectedHash, destination || process.env.SHELL_APPS_DIR || path.join(dataDir(), 'apps'))));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
