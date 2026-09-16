'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('../node-sidecar/node_modules/express');
const { snapshot, router } = require('../node-sidecar/lib/capabilities');

test('capability discovery is a versioned, local-first, default-deny contract', () => {
  const contract = snapshot();
  assert.equal(contract.contract, 'com.containedevolution.shell.capabilities');
  assert.match(contract.version, /^1\.\d+\.\d+$/);
  assert.equal(contract.localFirst, true);
  assert.equal(contract.accountRequired, false);
  assert.equal(contract.defaultPolicy, 'deny');
});

test('v1 declares every owner category once or more with unique capability ids', () => {
  const contract = snapshot();
  const required = ['apps', 'windows', 'data', 'files', 'browser', 'assistant', 'sync', 'devices', 'settings', 'integrations'];
  const ids = contract.capabilities.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual([...new Set(contract.capabilities.map(item => item.category))].sort(), required.sort());
});

test('optional integrations are disabled and privileged surfaces require grants', () => {
  const contract = snapshot();
  const tenari = contract.capabilities.find(item => item.id === 'integrations.tenari');
  assert.deepEqual(tenari, {
    id: 'integrations.tenari', category: 'integrations', state: 'optional',
    transport: 'adapter', grantRequired: true, enabled: false,
  });
  for (const id of ['files.scoped', 'browser.scoped', 'assistant.optional', 'sync.shell-cloud', 'devices.brics']) {
    assert.equal(contract.capabilities.find(item => item.id === id).grantRequired, true, id);
  }
});

test('window management is not advertised before real compositor acceptance', () => {
  const windows = snapshot().capabilities.find(item => item.id === 'windows.manage');
  assert.equal(windows.state, 'planned');
  assert.equal(windows.transport, null);
  assert.match(windows.note, /remains unavailable/);
});

test('Tenari network registration requires an explicit Shell integration flag', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'node-sidecar', 'index.js'), 'utf8');
  assert.match(source, /SHELL_TENARI_INTEGRATION === 'enabled'/);
  assert.match(source, /TENARI_INTEGRATION_ENABLED && pairing\.isPaired\(\)/);
  assert.match(source, /if \(!TENARI_INTEGRATION_ENABLED\) return;/);
});

test('published schema and implementation stay on capability contract v1', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'contracts', 'v1', 'capabilities.schema.json'), 'utf8'));
  assert.equal(schema.properties.contract.const, snapshot().contract);
  assert.match(snapshot().version, new RegExp(schema.properties.version.pattern));
});

test('discovery router serves the contract without caching it', async () => {
  const app = express();
  app.use('/v1/capabilities', router());
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/capabilities`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), snapshot());
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
