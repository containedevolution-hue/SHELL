'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createRegistry } = require('./native-desk-registry');
const { createNativeDeskManager, matches } = require('./native-desk-manager');

function registry() {
  return createRegistry({ contract: 'com.containedevolution.shell.native-clients', version: 1, clients: [
    { clientId: 'codex', label: 'Codex', desktopId: 'com.openai.codex', executable: '/opt/codex/codex', args: [], identity: { initialClasses: ['Codex'], processExecutables: ['/opt/codex/codex'] }, validation: { status: 'passed', validatedAt: '2026-09-06T20:00:00Z', evidence: 'CE-CHAT-1' } },
    { clientId: 'claude', label: 'Claude', desktopId: 'com.anthropic.claude', executable: '/opt/claude/claude', args: [], identity: { initialClasses: ['Claude'], processExecutables: ['/opt/claude/claude'] }, validation: { status: 'passed', validatedAt: '2026-09-06T20:00:00Z', evidence: 'CE-CHAT-2' } },
  ] });
}

function native(clientId, state, pid) {
  const names = { codex: ['Codex', '/opt/codex/codex'], claude: ['Claude', '/opt/claude/claude'] }[clientId];
  return { pid, windowId: `0x${pid}`, nativeSessionId: `process-${pid}`, processExecutable: names[1], initialClass: names[0], place: state };
}

function fakeBackend(initial = []) {
  const windows = initial.map(item => ({ ...item }));
  const calls = [];
  let failAfterDispatch = false;
  const backend = {
    calls, windows,
    probe: async () => ({ available: true, compositor: 'Hyprland test' }),
    listWindows: async () => windows.map(item => ({ ...item })),
    location: window => window.place,
    describe: (_window, state) => state,
    applicationFound: async () => true,
    launch: async entry => { calls.push(['launch', entry.clientId]); windows.push(native(entry.clientId, 'standalone', entry.clientId === 'codex' ? 101 : 202)); },
    waitForWindow: async (_entry, predicate) => windows.find(predicate),
    switch: async ({ park, target }) => {
      calls.push(['switch', park?.windowId || null, target.windowId]);
      if (park) windows.find(item => item.windowId === park.windowId).place = 'parked';
      windows.find(item => item.windowId === target.windowId).place = 'attached';
      if (failAfterDispatch) throw new Error('lost compositor reply');
    },
    park: async target => { calls.push(['park', target.windowId]); windows.find(item => item.windowId === target.windowId).place = 'parked'; },
    openStandalone: async target => { calls.push(['standalone', target.windowId]); windows.find(item => item.windowId === target.windowId).place = 'standalone'; },
    setFailure(value) { failAfterDispatch = value; },
  };
  return backend;
}

const slot = { id: 'chat-primary', x: 300, y: 100, width: 1200, height: 800, workspace: 'name:chat-lab', holdingWorkspace: 'special:ce-chat-holding', standaloneWorkspace: 'name:chat-standalone' };
const request = (clientId, action, id = `${clientId}-${action}`) => ({ requestId: id, hostSessionId: 'session-1', deskId: `desk-${clientId}`, clientId, action, slotId: 'chat-primary', preserveCapabilities: true, returnTo: { appId: 'chat', view: 'home', deskId: `desk-${clientId}` } });
const manager = (backend, accepted = true) => createNativeDeskManager({ registry: registry(), backend, slot, hostId: 'shell-1', hostSessionId: 'session-1', accepted, now: () => Date.parse('2026-09-06T20:00:00Z') });

test('manager stays unavailable until this installation passes native acceptance', async () => {
  const snapshot = await manager(fakeBackend(), false).observe();
  assert.equal(snapshot.deskManager.state, 'unavailable');
  assert.deepEqual(snapshot.deskManager.actions, []);
  assert.ok(snapshot.clients.every(client => client.state === 'unavailable'));
});

test('attach launches a registered client and atomic switching parks the prior process', async () => {
  const backend = fakeBackend([native('claude', 'attached', 22)]);
  const host = manager(backend);
  const ack = await host.manage(request('codex', 'attach'));
  assert.deepEqual(backend.calls, [['launch', 'codex'], ['switch', '0x22', '0x101']]);
  assert.equal(ack.state, 'attached');
  assert.equal(backend.windows.find(item => item.windowId === '0x22').place, 'parked');
  assert.equal(backend.windows.find(item => item.windowId === '0x101').place, 'attached');
});

test('runtime observations and acknowledgements conform to Shell Chat v2', async () => {
  const contract = await import('../../contracts/chat/v2.mjs');
  const backend = fakeBackend([native('codex', 'parked', 11)]);
  const host = manager(backend);
  const snapshot = contract.validateSnapshot(await host.observe(), Date.parse('2026-09-06T20:00:00Z'));
  const clean = contract.validateDeskRequest(request('codex', 'attach', 'contract-1'), snapshot);
  const ack = contract.validateDeskAck(await host.manage(clean), clean, snapshot);
  assert.equal(ack.state, 'attached');
  const healthRequest = contract.validateHealthRequest({ requestId: 'health-contract', hostSessionId: 'session-1', deskId: 'desk-codex', clientId: 'codex' }, snapshot);
  assert.equal(contract.validateHealthReport(await host.health(healthRequest), healthRequest, snapshot).checks.length, 5);
});

test('standalone, reattach and detach preserve the exact native session and window', async () => {
  const backend = fakeBackend([native('codex', 'attached', 11)]);
  const host = manager(backend);
  const standalone = await host.manage(request('codex', 'open-standalone'));
  const reattached = await host.manage(request('codex', 'reattach'));
  const detached = await host.manage(request('codex', 'detach'));
  assert.deepEqual([standalone.nativeSessionId, reattached.nativeSessionId, detached.nativeSessionId], ['process-11', 'process-11', 'process-11']);
  assert.deepEqual([standalone.windowId, reattached.windowId, detached.windowId], ['0x11', '0x11', '0x11']);
  assert.equal(detached.state, 'parked');
  assert.equal('terminate' in backend, false);
});

test('uncertain compositor mutation blocks changes until a fresh observation reconciles it', async () => {
  const backend = fakeBackend([native('codex', 'parked', 11)]);
  const host = manager(backend);
  backend.setFailure(true);
  await assert.rejects(host.manage(request('codex', 'reattach', 'one')), /lost compositor reply/);
  backend.setFailure(false);
  await assert.rejects(host.manage(request('codex', 'detach', 'two')), /Reconciliation/);
  const snapshot = await host.observe();
  assert.equal(snapshot.clients.find(client => client.clientId === 'codex').state, 'attached');
  assert.equal((await host.manage(request('codex', 'detach', 'three'))).state, 'parked');
});

test('closing Chat parks an attached client and never asks the backend to close or terminate it', async () => {
  const backend = fakeBackend([native('codex', 'attached', 11), native('claude', 'parked', 22)]);
  await manager(backend).closeChat();
  assert.deepEqual(backend.calls, [['park', '0x11']]);
  assert.equal(backend.windows.length, 2);
});

test('identity ignores titles and requires exact initial class plus executable path', () => {
  const entry = registry().get('codex');
  assert.equal(matches(entry, { ...native('codex', 'parked', 11), title: 'Claude' }), true);
  assert.equal(matches(entry, { ...native('codex', 'parked', 11), initialClass: 'Claude', title: 'Codex' }), false);
  assert.equal(matches(entry, { ...native('codex', 'parked', 11), processExecutable: '/tmp/codex', title: 'Codex' }), false);
});

test('health stays observational and leaves remote provider state unknown', async () => {
  const report = await manager(fakeBackend([native('codex', 'attached', 11)])).health({ requestId: 'health-1', hostSessionId: 'session-1', deskId: 'desk-codex', clientId: 'codex' });
  assert.equal(report.checks.find(check => check.id === 'window-attached').state, 'pass');
  assert.equal(report.checks.find(check => check.id === 'remote-session').state, 'unknown');
  assert.equal(report.checks.some(check => check.id === 'account'), false);
});

test('request ids are idempotent and cannot be rebound to another action', async () => {
  const backend = fakeBackend([native('codex', 'parked', 11)]);
  const host = manager(backend);
  const first = host.manage(request('codex', 'attach', 'same'));
  assert.equal(host.manage(request('codex', 'attach', 'same')), first);
  await first;
  await assert.rejects(host.manage(request('codex', 'detach', 'same')), /cannot be reused/);
  assert.equal(backend.calls.filter(call => call[0] === 'switch').length, 1);
});
