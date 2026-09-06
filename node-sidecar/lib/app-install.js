'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { normalizeManifest } = require('./app-registry');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function validateRelease(bytes, expectedHash) {
  if (bytes.length > 20 * 1024 * 1024) throw new Error('Release exceeds size limit');
  if (!/^[a-f0-9]{64}$/.test(expectedHash) || hash(bytes) !== expectedHash) throw new Error('Release digest mismatch');
  const input = JSON.parse(bytes.toString('utf8'));
  if (input.contractVersion !== 1 || input.kind !== 'ce.app.release' || !Array.isArray(input.files) || !input.files.length || input.files.length > 1000) throw new Error('Unsupported release');
  const files = new Map();
  const names = new Set();
  let total = 0;
  for (const file of input.files) {
    if (typeof file.path !== 'string' || !/^(?:app\.manifest\.json|LICENSE|NOTICE|(?:web|src|contracts)\/[a-zA-Z0-9_./-]+)$/.test(file.path)
      || file.path.split('/').some(part => !part || part === '.' || part === '..' || part.endsWith('.') || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))
      || file.path.endsWith('/server.js') || names.has(file.path.toLowerCase())) throw new Error('Unsafe or duplicate release path');
    if (file.encoding !== 'base64' || typeof file.content !== 'string') throw new Error('Invalid encoding');
    const body = Buffer.from(file.content, 'base64');
    total += body.length;
    if (body.toString('base64') !== file.content || hash(body) !== file.sha256 || total > 15 * 1024 * 1024) throw new Error('Invalid release content');
    files.set(file.path, body); names.add(file.path.toLowerCase());
  }
  const manifest = normalizeManifest(JSON.parse(files.get('app.manifest.json')?.toString() || 'null'), path.resolve('release'));
  if (!manifest || manifest.id !== input.id || manifest.version !== input.version || !files.has(manifest.entrypoints.web)) throw new Error('Invalid release manifest');
  return { manifest, files };
}
function installRelease(bytes, expectedHash, appsDirectory) {
  const { manifest, files } = validateRelease(bytes, expectedHash);
  const root = path.resolve(appsDirectory);
  fs.mkdirSync(root, { recursive: true });
  const destination = path.join(root, manifest.id);
  if (fs.existsSync(destination)) throw new Error('App already installed; existing installation was preserved');
  const stage = path.join(root, `.install-${randomUUID()}`);
  fs.mkdirSync(stage);
  try {
    for (const [relative, body] of files) {
      const target = path.join(stage, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, body, { flag: 'wx' });
    }
    fs.renameSync(stage, destination);
  } finally { fs.rmSync(stage, { recursive: true, force: true }); }
  return { id: manifest.id, version: manifest.version, directory: destination };
}
module.exports = { validateRelease, installRelease };
