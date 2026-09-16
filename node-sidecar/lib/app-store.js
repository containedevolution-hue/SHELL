'use strict';
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { installRelease, validateRelease } = require('./app-install');
const { createRegistry } = require('./app-registry');
const { syncCatalog, CATALOG_URL } = require('./app-catalog-source');
const { updateRelease, newer } = require('./app-update');
const NATIVE_ORIGINS = new Set(['tauri://localhost','http://tauri.localhost','https://tauri.localhost']);

function createAppStore({ catalogDirectory, appsDirectory, remote = false, localAuthority = null, now = Date.now, randomBytes = crypto.randomBytes }) {
  const router = express.Router();
  const installGrants = new Map();
  const registry = createRegistry(appsDirectory);
  const cacheDirectory = path.join(appsDirectory,'.catalog');
  let nextRefresh=0, refreshing, sourceStatus='bundled';
  async function refreshCatalog() {
    if(!remote || now()<nextRefresh) return;
    if(!refreshing) refreshing=syncCatalog(cacheDirectory).then(()=>{sourceStatus='current';nextRefresh=now()+5*60*1000;})
      .catch(()=>{sourceStatus='offline';nextRefresh=now()+30000;}).finally(()=>{refreshing=null;});
    await refreshing;
  }
  router.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && !NATIVE_ORIGINS.has(origin) && origin !== `${req.protocol}://${req.get('host')}`) return res.status(403).json({ error:'shell_surface_required' });
    res.set('Cache-Control','no-store');
    next();
  });
  function list() {
    const directory=remote && fs.existsSync(path.join(cacheDirectory,'catalog.json'))?cacheDirectory:catalogDirectory;
    const catalog = JSON.parse(fs.readFileSync(path.join(directory, 'catalog.json'), 'utf8'));
    if (catalog.contractVersion !== 1 || !Array.isArray(catalog.apps)) throw new Error('Unsupported catalog');
    return catalog.apps.map(app => {
      if (!/^[a-z][a-z0-9-]{1,62}$/.test(app.id) || !/^[a-z0-9.-]+\.ceapp\.json$/.test(app.file)) throw new Error('Invalid catalog entry');
      const file = path.join(directory, app.file);
      if (fs.statSync(file).size > 20 * 1024 * 1024) throw new Error('Release exceeds size limit');
      const bytes = fs.readFileSync(file);
      const { manifest } = validateRelease(bytes, app.sha256);
      if (manifest.id !== app.id || manifest.version !== app.version) throw new Error('Release identity mismatch');
      return { ...app, bytes };
    });
  }
  router.get('/', async (_req, res) => {
    try {
      await refreshCatalog();
      const installed = registry.list();
      const entries = list();
      for (const [key, grant] of installGrants) if (grant.used || now() >= grant.expiresAt) installGrants.delete(key);
      const token = randomBytes(32).toString('hex');
      const installGrant = { token, expiresAt:now() + 2 * 60 * 1000, used:false, releases:new Map(entries.map(app=>[app.id,app.sha256])) };
      installGrants.set(token, installGrant);
      res.json({ contractVersion:1, sourceUrl:CATALOG_URL, sourceStatus, installToken:installGrant.token, installTokenExpiresAt:installGrant.expiresAt, apps:entries.map(({id,name,description,version,sha256}) => {
        const current = installed.find(app => app.id === id);
        return { id,name,description,version,sha256, updateAvailable:!!current && newer(version,current.version), installedVersion:current?.version || null, launchUrl:current?.launchUrl || null };
      }) });
    } catch { res.status(503).json({ error:'catalog_unavailable' }); }
  });
  router.post('/:id/install', (req, res) => {
    const authorization = req.get('Authorization');
    let reviewedHash;
    if (authorization) {
      const result = localAuthority?.authenticate(req, 'app-store.install');
      if (!result?.ok) return res.status(result?.status || 401).json({ error:result?.error || 'installation_not_authorized' });
      reviewedHash = req.get('X-Shell-Release');
    } else {
      const candidate = req.get('X-Shell-Install');
      const installGrant = installGrants.get(candidate);
      if (!installGrant) return res.status(403).json({ error:'installation_not_authorized' });
      if (now() >= installGrant.expiresAt) return res.status(401).json({ error:'install_token_expired' });
      if (installGrant.used) return res.status(409).json({ error:'install_token_replayed' });
      installGrant.used = true;
      reviewedHash = installGrant.releases.get(req.params.id);
    }
    try {
      const app = list().find(item => item.id === req.params.id);
      if (!app) return res.status(404).json({ error:'app_not_in_catalog' });
      if (app.sha256 !== reviewedHash) return res.status(409).json({error:'release_changed',message:'The release changed. Review the refreshed catalog before installing.'});
      const installed = registry.list().find(item => item.id === app.id);
      if (installed) {
        if (installed.version !== app.version) {
          const updated=updateRelease(app.bytes,app.sha256,appsDirectory);
          return res.json({installed:true,updated:true,...updated,launchUrl:registry.list().find(item=>item.id===app.id).launchUrl});
        }
        return res.json({ installed:true, launchUrl:installed.launchUrl });
      }
      installRelease(app.bytes, app.sha256, appsDirectory);
      return res.status(201).json({ installed:true, launchUrl:registry.list().find(item => item.id === app.id).launchUrl });
    } catch { return res.status(409).json({ error:'installation_failed', message:'The package could not be installed. Existing apps were preserved.' }); }
  });
  return router;
}
module.exports = { createAppStore };
