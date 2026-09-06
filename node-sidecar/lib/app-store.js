'use strict';
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { installRelease, validateRelease } = require('./app-install');
const { createRegistry } = require('./app-registry');
const NATIVE_ORIGINS = new Set(['tauri://localhost','http://tauri.localhost','https://tauri.localhost']);

function createAppStore({ catalogDirectory, appsDirectory }) {
  const router = express.Router();
  const token = crypto.randomBytes(32).toString('hex');
  const registry = createRegistry(appsDirectory);
  router.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && !NATIVE_ORIGINS.has(origin) && origin !== `${req.protocol}://${req.get('host')}`) return res.status(403).json({ error:'shell_surface_required' });
    res.set('Cache-Control','no-store');
    next();
  });
  function list() {
    const catalog = JSON.parse(fs.readFileSync(path.join(catalogDirectory, 'catalog.json'), 'utf8'));
    if (catalog.contractVersion !== 1 || !Array.isArray(catalog.apps)) throw new Error('Unsupported catalog');
    return catalog.apps.map(app => {
      if (!/^[a-z][a-z0-9-]{1,62}$/.test(app.id) || !/^[a-z0-9.-]+\.ceapp\.json$/.test(app.file)) throw new Error('Invalid catalog entry');
      const file = path.join(catalogDirectory, app.file);
      if (fs.statSync(file).size > 20 * 1024 * 1024) throw new Error('Release exceeds size limit');
      const bytes = fs.readFileSync(file);
      const { manifest } = validateRelease(bytes, app.sha256);
      if (manifest.id !== app.id || manifest.version !== app.version) throw new Error('Release identity mismatch');
      return { ...app, bytes };
    });
  }
  router.get('/', (_req, res) => {
    try {
      const installed = registry.list();
      res.json({ contractVersion:1, installToken:token, apps:list().map(({id,name,description,version}) => {
        const current = installed.find(app => app.id === id);
        return { id,name,description,version, installedVersion:current?.version || null, launchUrl:current?.launchUrl || null };
      }) });
    } catch { res.status(503).json({ error:'catalog_unavailable' }); }
  });
  router.post('/:id/install', (req, res) => {
    if (req.get('X-Shell-Install') !== token) return res.status(403).json({ error:'installation_not_authorized' });
    try {
      const app = list().find(item => item.id === req.params.id);
      if (!app) return res.status(404).json({ error:'app_not_in_catalog' });
      const installed = registry.list().find(item => item.id === app.id);
      if (installed) {
        if (installed.version !== app.version) return res.status(409).json({ error:'update_not_supported' });
        return res.json({ installed:true, launchUrl:installed.launchUrl });
      }
      installRelease(app.bytes, app.sha256, appsDirectory);
      return res.status(201).json({ installed:true, launchUrl:registry.list().find(item => item.id === app.id).launchUrl });
    } catch { return res.status(409).json({ error:'installation_failed', message:'The package could not be installed. Existing apps were preserved.' }); }
  });
  return router;
}
module.exports = { createAppStore };
