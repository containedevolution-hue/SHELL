'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { createRegistry, loadRegistry, normalizeRegistry } = require('./native-desk-registry');

const validation = evidence => ({ status: 'passed', validatedAt: '2026-09-06T20:00:00Z', evidence });
function client(overrides = {}) {
  return {
    clientId: 'codex', label: 'Codex', identities: {
      linux: { desktopId: 'com.openai.codex', executable: '/opt/codex/codex', args: [], initialClasses: ['Codex'], processExecutables: ['/opt/codex/codex'], validation: validation('Linux acceptance.') },
      windows: { packageFamilyName: 'OpenAI.Codex_2p2nqsd0c76g0', applicationUserModelId: 'OpenAI.Codex_2p2nqsd0c76g0!App', relativeExecutables: ['app/ChatGPT.exe'], windowClasses: ['Chrome_WidgetWin_1'], validation: validation('Windows acceptance.') },
    },
    ...overrides,
  };
}
const registry = value => ({ contract: 'com.containedevolution.shell.native-clients', version: 2, clients: [value] });

test('production registry is valid and admits no unverified provider guesses', () => {
  const loaded = loadRegistry(path.join(__dirname, '..', 'config', 'native-desk-clients.json'));
  assert.deepEqual(loaded.list(), []);
  assert.throws(() => createRegistry({ contract: 'wrong', version: 2, clients: [] }, 'win32'), /Unsupported/);
});

test('registry selects only the current platform identity and keeps acceptance platform-specific', () => {
  const linux = createRegistry(registry(client()), 'linux').get('codex');
  const windows = createRegistry(registry(client()), 'win32').get('codex');
  assert.equal(linux.executable, '/opt/codex/codex');
  assert.equal(windows.packageFamilyName, 'OpenAI.Codex_2p2nqsd0c76g0');
  assert.equal(windows.relativeExecutables[0], 'app\\chatgpt.exe');
  assert.equal(createRegistry(registry(client()), 'darwin').get('codex'), null);
});

test('registry rejects patterns, Linux relative executables, unvalidated identities and extra title fields', () => {
  const mutateLinux = change => client({ identities: { linux: { ...client().identities.linux, ...change } } });
  assert.throws(() => normalizeRegistry(registry(mutateLinux({ executable: 'codex' }))), /absolute Linux path/);
  assert.throws(() => normalizeRegistry(registry(mutateLinux({ initialClasses: ['.*Codex.*'] }))), /exact, not patterns/);
  assert.throws(() => normalizeRegistry(registry(mutateLinux({ processExecutables: ['codex'] }))), /absolute Linux path/);
  assert.throws(() => normalizeRegistry(registry(mutateLinux({ validation: { status: 'pending' } }))), /has not passed/);
  assert.throws(() => normalizeRegistry(registry({ ...client(), title: 'ChatGPT' })), /field/);
});

test('Windows registration requires stable packaged identity and package-relative executables', () => {
  const mutateWindows = change => client({ identities: { windows: { ...client().identities.windows, ...change } } });
  assert.throws(() => normalizeRegistry(registry(mutateWindows({ applicationUserModelId: 'Other_family!App' }))), /packaged Windows/);
  assert.throws(() => normalizeRegistry(registry(mutateWindows({ relativeExecutables: ['C:\\Program Files\\WindowsApps\\ChatGPT.exe'] }))), /package-relative/);
  assert.throws(() => normalizeRegistry(registry(mutateWindows({ relativeExecutables: ['..\\ChatGPT.exe'] }))), /package-relative/);
  assert.throws(() => normalizeRegistry(registry(mutateWindows({ windowClasses: ['Chrome_.*'] }))), /exact, not patterns/);
});
