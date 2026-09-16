'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'node-sidecar', 'node_modules');
const destination = path.join(root, 'src-tauri', 'bundle-resources', 'node_modules');

function nativeBinaryForHost(file) {
  const normalized = file.split(path.sep).join('/');
  if (process.platform === 'win32' && process.arch === 'x64') {
    return normalized.includes('/prebuilds/win32-x64/');
  }
  if (process.platform === 'linux' && process.arch === 'x64') {
    return normalized.includes('/prebuilds/linux-x64/') && normalized.endsWith('.glibc.node');
  }
  throw new Error(`No sidecar native-binary bundle policy for ${process.platform}-${process.arch}`);
}

if (!fs.existsSync(source)) {
  throw new Error('node-sidecar/node_modules is missing; run `npm --prefix node-sidecar ci` first');
}

fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(path.dirname(destination), { recursive: true });

let includedNativeBinaries = 0;
let excludedNativeBinaries = 0;
fs.cpSync(source, destination, {
  recursive: true,
  filter(file) {
    if (!file.endsWith('.node')) return true;
    if (nativeBinaryForHost(file)) {
      includedNativeBinaries += 1;
      return true;
    }
    excludedNativeBinaries += 1;
    return false;
  },
});

if (includedNativeBinaries === 0) {
  fs.rmSync(destination, { recursive: true, force: true });
  throw new Error(`No native sidecar binaries matched ${process.platform}-${process.arch}`);
}

console.log(
  `[prepare-sidecar-bundle] staged ${includedNativeBinaries} host native binaries; excluded ${excludedNativeBinaries} foreign binaries`,
);
