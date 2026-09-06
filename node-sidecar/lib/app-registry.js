'use strict';

const express = require('express');
const fs = require('node:fs');
const path = require('node:path');

const MANIFEST_VERSION = 1;

function safeChild(root, relative) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, String(relative || ''));
  return resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep) ? resolved : null;
}

function normalizeManifest(input, directory) {
  if (!input || input.contractVersion !== MANIFEST_VERSION) return null;
  if (typeof input.name !== 'string' || !input.name.trim() || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(input.version || '')) return null;
  if (!/^[a-z][a-z0-9-]{1,62}$/.test(input.id || '')) return null;
  if (!input.entrypoints || typeof input.entrypoints.web !== 'string') return null;
  if (!/^web\/[a-zA-Z0-9_.\/-]+$/.test(input.entrypoints.web) || input.entrypoints.web.split('/').some(part => !part || part === '..' || part === '.')) return null;
  if (!safeChild(directory, input.entrypoints.web)) return null;
  const capabilities = Array.isArray(input.capabilities) ? input.capabilities : [];
  if (capabilities.some(item => !item || !item.id || !['required', 'optional'].includes(item.requirement))) return null;
  if (capabilities.some(item => item.requirement === 'required' && item.id !== 'storage.documents.local')) return null;
  if (new Set(capabilities.map(item => item.id)).size !== capabilities.length) return null;
  return Object.freeze({
    contractVersion:MANIFEST_VERSION,
    id:input.id,
    name:String(input.name || input.id).slice(0, 80),
    version:String(input.version || ''),
    entrypoints:{ web:input.entrypoints.web },
    capabilities:capabilities.map(item => ({ id:String(item.id), requirement:item.requirement })),
  });
}

function createRegistry(appsDir) {
  const root = path.resolve(appsDir);

  function list() {
    if (!fs.existsSync(root)) return [];
    return fs.readdirSync(root, { withFileTypes:true })
      .filter(entry => entry.isDirectory())
      .map(entry => {
        const directory = path.join(root, entry.name);
        try {
          const manifest = normalizeManifest(JSON.parse(fs.readFileSync(path.join(directory, 'app.manifest.json'), 'utf8')), directory);
          if (!manifest || manifest.id !== entry.name || !safeFile(directory, manifest.entrypoints.web)) return null;
          return { ...manifest, launchUrl:`/v1/apps/${manifest.id}/${manifest.entrypoints.web.replace(/\\/g, '/')}` };
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function app(id) {
    return list().find(item => item.id === id) || null;
  }

  function router() {
    const result = express.Router();
    result.get('/', (_req, res) => res.set('Cache-Control', 'no-store').json({ contractVersion:1, apps:list() }));
    result.use('/:id', (req, res) => {
      const installed = app(req.params.id);
      if (!installed) return res.status(404).json({ error:'app_not_installed' });
      const directory = path.join(root, installed.id);
      if (!['GET', 'HEAD'].includes(req.method)) return res.status(405).end();
      const relative = req.path.replace(/^\//, '');
      if (!/^(web|src|contracts)\//.test(relative) && relative !== 'app.manifest.json' && relative !== 'LICENSE') return res.status(404).end();
      const file = safeFile(directory, relative);
      if (!file) return res.status(404).json({ error:'app_asset_not_found' });
      res.set('Cache-Control', 'no-store').set('X-Content-Type-Options', 'nosniff').sendFile(file);
    });
    return result;
  }

  return Object.freeze({ list, router });
}

module.exports = { MANIFEST_VERSION, createRegistry, normalizeManifest, safeChild };

function safeFile(directory, relative) {
  try {
    const file = safeChild(directory, relative);
    if (!file || !fs.statSync(file).isFile()) return null;
    const realRoot = fs.realpathSync(directory);
    const realFile = fs.realpathSync(file);
    return realFile.startsWith(realRoot + path.sep) ? realFile : null;
  } catch { return null; }
}
