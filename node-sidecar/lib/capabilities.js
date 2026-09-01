'use strict';

const express = require('express');

const CONTRACT = Object.freeze({
  contract: 'com.containedevolution.shell.capabilities',
  version: '1.0.0',
  product: 'SHELL',
  localFirst: true,
  accountRequired: false,
  defaultPolicy: 'deny',
  capabilities: Object.freeze([
    { id: 'apps.launch', category: 'apps', state: 'available', transport: 'tauri' },
    { id: 'windows.manage', category: 'windows', state: 'available', transport: 'tauri' },
    { id: 'data.local.documents.read', category: 'data', state: 'available', transport: 'loopback-http', endpoint: '/local/docs' },
    { id: 'data.local.pouchdb', category: 'data', state: 'legacy', transport: 'loopback-http', note: 'Scheduled for replacement by SHELL SQLite.' },
    { id: 'files.scoped', category: 'files', state: 'available', transport: 'mcp', grantRequired: true },
    { id: 'browser.scoped', category: 'browser', state: 'available', transport: 'mcp', grantRequired: true },
    { id: 'assistant.optional', category: 'assistant', state: 'optional', transport: 'integration', grantRequired: true, provider: null },
    { id: 'sync.shell-cloud', category: 'sync', state: 'planned', transport: null, grantRequired: true },
    { id: 'devices.brics', category: 'devices', state: 'planned', transport: null, grantRequired: true },
    { id: 'settings.local', category: 'settings', state: 'available', transport: 'tauri' },
    { id: 'integrations.tenari', category: 'integrations', state: 'optional', transport: 'adapter', grantRequired: true, enabled: false },
  ]),
});

function snapshot() {
  return JSON.parse(JSON.stringify(CONTRACT));
}

function router() {
  const result = express.Router();
  result.get('/', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(snapshot());
  });
  return result;
}

module.exports = { CONTRACT, snapshot, router };
