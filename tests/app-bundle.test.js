'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');

test('desktop packaging includes the verified catalog and excludes local sidecar data', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root,'src-tauri/tauri.conf.json'),'utf8'));
  assert.equal(config.build.beforeBuildCommand,'node scripts/prepare-app-catalog.js');
  assert.equal(config.bundle.resources['../node-sidecar/catalog'],'node-sidecar/catalog');
  assert.equal(config.bundle.resources['../node-sidecar'],undefined);
  for (const resource of Object.keys(config.bundle.resources)) assert.doesNotMatch(resource, /(?:data|\.env|credentials)(?:\/|$)/);
  assert.match(fs.readFileSync(path.join(root,'src-tauri/Cargo.toml'),'utf8'),/default = \["consumer"\]/);
});
