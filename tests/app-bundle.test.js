'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');

test('desktop packaging includes the verified catalog and excludes local sidecar data', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root,'src-tauri/tauri.conf.json'),'utf8'));
  assert.equal(config.build.beforeBuildCommand,'node scripts/prepare-app-catalog.js && node scripts/prepare-sidecar-bundle.js');
  assert.equal(config.bundle.resources['../node-sidecar/catalog'],'node-sidecar/catalog');
  assert.equal(config.bundle.resources['../node-sidecar'],undefined);
  for (const resource of Object.keys(config.bundle.resources)) assert.doesNotMatch(resource, /(?:data|\.env|credentials)(?:\/|$)/);
  assert.match(fs.readFileSync(path.join(root,'src-tauri/Cargo.toml'),'utf8'),/default = \["consumer"\]/);
});

test('bundle targets cover Windows nsis and Linux appimage from one config', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root,'src-tauri/tauri.conf.json'),'utf8'));
  assert.deepEqual(config.bundle.targets, ['nsis', 'appimage']);
  assert.equal(config.bundle.windows.nsis.installMode, 'currentUser');
  assert.equal(config.bundle.linux.appimage.bundleMediaFramework, false);
  // The sidecar Node binary is still a per-triple externalBin. node_modules is
  // staged per host so linuxdeploy never scans unused foreign native binaries.
  assert.deepEqual(config.bundle.externalBin, ['binaries/node']);
  assert.equal(config.bundle.resources['bundle-resources/node_modules'], 'node-sidecar/node_modules');
});

test('sidecar bundle staging excludes foreign native addons without mutating npm install', () => {
  const src = fs.readFileSync(path.join(root,'scripts/prepare-sidecar-bundle.js'),'utf8');
  assert.match(src, /src-tauri', 'bundle-resources', 'node_modules/);
  assert.match(src, /prebuilds\/linux-x64\//);
  assert.match(src, /\.glibc\.node/);
  assert.match(src, /prebuilds\/win32-x64\//);
  assert.doesNotMatch(src, /rmSync\(source/);
});

test('fetch-node-binary pins Linux Node by triple and checksum-verifies downloads', () => {
  const src = fs.readFileSync(path.join(root,'scripts/fetch-node-binary.mjs'),'utf8');
  assert.match(src, /const NODE_VERSION = 'v24\.18\.0'/);
  assert.match(src, /'win32-x64':[\s\S]*?triple: 'x86_64-pc-windows-msvc'/);
  assert.match(src, /'linux-x64':[\s\S]*?triple: 'x86_64-unknown-linux-gnu'/);
  assert.match(src, /archiveMember: `node-\$\{NODE_VERSION\}-linux-x64\/bin\/node`/);
  assert.match(src, /SHASUMS256\.txt/);
  assert.match(src, /createHash\('sha256'\)/);
  assert.match(src, /checksum mismatch/);
});
