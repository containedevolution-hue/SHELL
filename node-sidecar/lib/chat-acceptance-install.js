'use strict';

const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { installRelease, validateRelease } = require('./app-install');
const { normalizeChatAcceptanceManifest, safeChild } = require('./app-registry');

const PROFILE = Object.freeze({ id: 'chat', version: '0.1.0-dev', private: true, stage: 'acceptance',
  sha256: '2261aba0f5a2b8d79339d5072e992c7457c7a9e9ce8139e5c3246a804ff4d1b7' });
const RECEIPT = '.shell-chat-acceptance.json';

function exactRelease(input, profile = PROFILE) {
  const keys = Object.keys(input).sort();
  if (JSON.stringify(keys) !== JSON.stringify(['contractVersion', 'files', 'id', 'kind', 'private', 'stage', 'version']) ||
      input.id !== profile.id || input.version !== profile.version || input.private !== true || input.stage !== profile.stage)
    throw new Error('Release is not the exact private Chat acceptance profile');
}

function validateChatAcceptanceRelease(bytes, expectedHash = PROFILE.sha256, profile = PROFILE) {
  if (expectedHash !== profile.sha256) throw new Error('Untrusted Chat acceptance digest');
  return validateRelease(bytes, expectedHash, { manifestNormalizer: normalizeChatAcceptanceManifest,
    releaseValidator: input => exactRelease(input, profile) });
}

function installChatAcceptance(bytes, directory, profile = PROFILE) {
  const validated = validateChatAcceptanceRelease(bytes, profile.sha256, profile);
  const existing = path.resolve(directory, profile.id);
  if (fs.existsSync(existing)) {
    const names = [];
    const walk = (root, prefix = '') => {
      for (const entry of fs.readdirSync(root, {withFileTypes:true})) {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) walk(path.join(root,entry.name),relative);
        else if (entry.isFile() && relative !== RECEIPT) names.push(relative);
        else if (!entry.isFile()) throw new Error('Existing Chat acceptance installation is not immutable');
      }
    };
    walk(existing);
    if (names.length !== validated.files.size || names.some(name => !validated.files.has(name)) ||
        [...validated.files].some(([name,body]) => cryptoHash(fs.readFileSync(path.join(existing,...name.split('/')))) !== cryptoHash(body)))
      throw new Error('Existing Chat acceptance installation does not match the trusted artifact');
    const files = Object.fromEntries([...validated.files].map(([name, body]) => [name, cryptoHash(body)]));
    const receipt = path.join(existing,RECEIPT), staged = `${receipt}.new`;
    fs.writeFileSync(staged,JSON.stringify({...profile,files,installedAt:new Date().toISOString()}),{flag:'wx'});
    try { fs.rmSync(receipt,{force:true}); fs.renameSync(staged,receipt); }
    finally { fs.rmSync(staged,{force:true}); }
    return Object.freeze({id:profile.id,version:profile.version,directory:existing,private:true,stage:profile.stage,sha256:profile.sha256});
  }
  const result = installRelease(bytes, profile.sha256, directory,
    { manifestNormalizer: normalizeChatAcceptanceManifest, releaseValidator: input => exactRelease(input, profile) });
  try {
    const files = Object.fromEntries([...validated.files].map(([name, body]) => [name, cryptoHash(body)]));
    fs.writeFileSync(path.join(result.directory, RECEIPT), JSON.stringify({ ...profile, files, installedAt: new Date().toISOString() }), { flag: 'wx' });
  } catch (error) { fs.rmSync(result.directory, { recursive: true, force: true }); throw error; }
  return Object.freeze({ ...result, private: true, stage: profile.stage, sha256: profile.sha256 });
}

function installedIdentity(directory, profile = PROFILE) {
  try {
    const root = path.resolve(directory, profile.id);
    const receipt = JSON.parse(fs.readFileSync(path.join(root, RECEIPT), 'utf8'));
    const manifest = normalizeChatAcceptanceManifest(JSON.parse(fs.readFileSync(path.join(root, 'app.manifest.json'), 'utf8')), root);
    if (!manifest || receipt.id !== profile.id || receipt.version !== profile.version || receipt.private !== true ||
        receipt.stage !== profile.stage || receipt.sha256 !== profile.sha256) return null;
    if (!receipt.files || Object.keys(receipt.files).length < 1 || Object.entries(receipt.files).some(([relative,digest]) => {
      const file=safeChild(root,relative); try { return !file || cryptoHash(fs.readFileSync(file))!==digest; } catch { return true; }
    })) return null;
    return Object.freeze({ ...profile, directory: root, entrypoint: manifest.entrypoints.web,
      files:Object.freeze(Object.keys(receipt.files)), launchPath: `/__shell/chat-acceptance/${manifest.entrypoints.web}` });
  } catch { return null; }
}

function createChatAcceptanceAssets(directory, profile = PROFILE) {
  const router = express.Router();
  router.use((req, res) => {
    const identity = installedIdentity(directory, profile);
    if (!identity || !['GET', 'HEAD'].includes(req.method)) return res.status(identity ? 405 : 404).end();
    const relative = req.path.replace(/^\//, '');
    if (!identity.files.includes(relative) || (!/^(?:web|src|contracts)\/[a-zA-Z0-9_./-]+$/.test(relative) && relative !== 'app.manifest.json')) return res.status(404).end();
    const file = safeChild(identity.directory, relative);
    try {
      if (!file || !fs.statSync(file).isFile() || !fs.realpathSync(file).startsWith(fs.realpathSync(identity.directory) + path.sep)) return res.status(404).end();
      res.set('Cache-Control', 'no-store').set('X-Content-Type-Options', 'nosniff')
        .set('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'")
        .sendFile(file);
    } catch { return res.status(404).end(); }
  });
  return Object.freeze({ identity: () => installedIdentity(directory, profile), router });
}

function cryptoHash(bytes) { return require('node:crypto').createHash('sha256').update(bytes).digest('hex'); }

module.exports = { PROFILE, createChatAcceptanceAssets, installChatAcceptance, installedIdentity, validateChatAcceptanceRelease };
