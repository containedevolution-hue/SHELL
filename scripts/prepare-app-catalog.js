'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validateRelease } = require('../node-sidecar/lib/app-install');
const root = path.resolve(__dirname, '..');
const catalog = require('../contracts/app-catalog.json');
const destination = path.join(root, 'node-sidecar/catalog');
fs.mkdirSync(destination, { recursive:true });
for (const app of catalog.apps) {
  const target = path.join(destination, app.file);
  if (!fs.existsSync(target)) {
    if (process.env.CE_APP_RELEASE_DIR) {
      fs.copyFileSync(path.join(process.env.CE_APP_RELEASE_DIR, app.file), target, fs.constants.COPYFILE_EXCL);
    } else {
      const result = spawnSync('gh', ['release','download',app.tag,'--repo',app.repository,'--pattern',app.file,'--dir',destination], { stdio:'inherit', windowsHide:true });
      if (result.error || result.status !== 0) throw new Error('Could not obtain the pinned app release. Authenticate gh for the private Apps repository, or provide CE_APP_RELEASE_DIR.');
    }
  }
  const { manifest } = validateRelease(fs.readFileSync(target), app.sha256);
  if (manifest.id !== app.id || manifest.version !== app.version) throw new Error('Catalog identity mismatch');
}
fs.writeFileSync(path.join(destination, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
console.log(`Prepared ${catalog.apps.length} verified app package(s) for SHELL. No source checkout or user documents are included.`);
