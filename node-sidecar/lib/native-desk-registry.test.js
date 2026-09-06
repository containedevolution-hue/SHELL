'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { createRegistry, loadRegistry, normalizeRegistry } = require('./native-desk-registry');

function client(overrides = {}) {
  return {
    clientId: 'codex', label: 'Codex', desktopId: 'com.openai.codex', executable: '/opt/codex/codex', args: [],
    identity: { initialClasses: ['Codex'], processExecutables: ['/opt/codex/codex'] },
    validation: { status: 'passed', validatedAt: '2026-09-06T20:00:00Z', evidence: 'Capability comparison record CE-CHAT-1.' },
    ...overrides,
  };
}

test('production registry is valid and admits no unverified provider guesses', () => {
  const registry = loadRegistry(path.join(__dirname, '..', 'config', 'native-desk-clients.json'));
  assert.deepEqual(registry.clients, []);
});

test('registry accepts exact process and initial-class identity only after validation', () => {
  const registry = createRegistry(normalizeRegistry({ contract: 'com.containedevolution.shell.native-clients', version: 1, clients: [client()] }));
  assert.equal(registry.get('codex').identity.initialClasses[0], 'Codex');
  assert.equal(registry.get('unknown'), null);
});

test('registry rejects commands, relative executables, title matching and unvalidated clients', () => {
  const base = value => ({ contract: 'com.containedevolution.shell.native-clients', version: 1, clients: [value] });
  assert.throws(() => normalizeRegistry(base(client({ executable: 'codex' }))), /absolute Linux path/);
  assert.throws(() => normalizeRegistry(base(client({ identity: { initialClasses: ['.*Codex.*'], processExecutables: ['/opt/codex/codex'] } }))), /exact values/);
  assert.throws(() => normalizeRegistry(base(client({ identity: { initialClasses: ['Codex'], processExecutables: ['codex'] } }))), /absolute Linux path/);
  assert.throws(() => normalizeRegistry(base(client({ validation: { status: 'pending' } }))), /has not passed/);
  assert.throws(() => normalizeRegistry(base({ ...client(), title: 'ChatGPT' })), /Unsupported|Invalid|title/);
});
