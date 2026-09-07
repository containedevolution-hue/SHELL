'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createNativeDeskBridge } = require('./native-desk-bridge');
const { createRegistry } = require('./native-desk-registry');
const { createHyprlandBackend } = require('./hyprland-native-desk');
const { resolveNativeDeskSlot } = require('./native-desk-geometry');

// Synthetic identities only; these are not installed-provider evidence.
function fixture(accepted = true) {
  const peer = Object.freeze({});
  const now = 10000;
  const chat = { pid: 1, windowId: '0x1', nativeSessionId: 'process-1', processExecutable: '/fixture/chat', initialClass: 'FixtureChat',
    at: [-1600, 0], size: [1600, 1000], workspace: 'lab', workspaceId: 4, floating: true };
  const client = { pid: 2, windowId: '0x2', nativeSessionId: 'process-2', processExecutable: '/fixture/provider', initialClass: 'FixtureProvider',
    at: [0, 0], size: [800, 600], workspace: 'separate', workspaceId: 5, floating: true };
  const windows = [chat, client];
  const calls = [];
  const backend = { probe: async () => ({ available: true, compositor: 'Hyprland fixture' }),
    listWindows: async () => structuredClone(windows), location: createHyprlandBackend().location,
    describe: (_window, state) => state, applicationFound: async () => true,
    switch: async ({ park, target, slot }) => {
      calls.push('switch');
      if (park) windows.find(w => w.windowId === park.windowId).workspace = slot.holdingWorkspace;
      Object.assign(windows.find(w => w.windowId === target.windowId), { at: [slot.x, slot.y], size: [slot.width, slot.height], workspace: 'lab', workspaceId: Number(slot.workspace), floating: true });
    },
    park: async (target, slot) => { calls.push('park'); windows.find(w => w.windowId === target.windowId).workspace = slot.holdingWorkspace; },
    openStandalone: async target => { calls.push('standalone'); Object.assign(windows.find(w => w.windowId === target.windowId), { workspace: 'separate', workspaceId: 5 }); },
  };
  const registry = createRegistry({ contract: 'com.containedevolution.shell.native-clients', version: 1, clients: [
    { clientId: 'fixture', label: 'Fixture', desktopId: 'fixture.provider', executable: '/fixture/provider', args: [],
      identity: { initialClasses: ['FixtureProvider'], processExecutables: ['/fixture/provider'] },
      validation: { status: 'passed', validatedAt: '2026-09-06T20:00:00Z', evidence: 'synthetic-test-only' } },
  ] });
  const layout = { observedAt: now, contentMatchesWindow: true, windowId: chat.windowId, nativeSessionId: chat.nativeSessionId,
    compositorSize: [1600, 1000], viewport: { width: 1600, height: 1000 }, rect: { x: 200, y: 100, width: 1200, height: 800 } };
  const bridge = createNativeDeskBridge({ peer, chatIdentity: chat, backend, readLayout: async () => structuredClone(layout),
    registry, acceptancePassed: accepted, hostId: 'shell-fixture', now: () => now });
  const port = bridge.connect(peer);
  const request = async (action, id = action) => ({ requestId: id, hostSessionId: (await port.observe()).hostSessionId,
    deskId: 'desk-fixture', clientId: 'fixture', action, slotId: 'chat-primary', preserveCapabilities: true,
    returnTo: { appId: 'chat', view: 'home', deskId: 'desk-fixture' } });
  return { peer, now, chat, client, windows, calls, backend, layout, bridge, port, request };
}

test('bridge grants only the exact native peer; serialized lookalikes cannot attach', async () => {
  const f = fixture();
  assert.throws(() => f.bridge.connect({}), /authority/);
  assert.throws(() => f.bridge.connect(JSON.parse(JSON.stringify(f.peer))), /authority/);
  assert.throws(() => f.bridge.connect(f.peer), /already connected/);
  await assert.rejects(f.bridge.close({}), /authority/);
  assert.equal((await f.port.observe()).deskManager.state, 'available');
  assert.deepEqual(Object.keys(f.port), ['observe', 'manage', 'health']);
});

test('default-off acceptance remains unavailable through the authenticated port', async () => {
  const f = fixture(false);
  assert.equal((await f.port.observe()).deskManager.state, 'unavailable');
  await assert.rejects(f.port.manage(await f.request('attach')), /acceptance/);
  assert.deepEqual(f.calls, []);
});

test('bridge places on a negative-origin monitor and preserves the standalone session', async () => {
  const f = fixture();
  const ack = await f.port.manage(await f.request('attach'));
  assert.deepEqual(f.client.at, [-1400, 100]);
  assert.deepEqual(f.client.size, [1200, 800]);
  const separate = await f.port.manage(await f.request('open-standalone'));
  const back = await f.port.manage(await f.request('reattach'));
  assert.equal(separate.nativeSessionId, ack.nativeSessionId);
  assert.equal(back.windowId, ack.windowId);
  await f.bridge.close(f.peer);
  assert.equal(f.client.workspace, 'special:ce-chat-holding');
  assert.equal(f.windows.length, 2);
  await assert.rejects(f.port.observe(), /revoked/);
});

test('move and monitor changes park the previous overlay before adopting new geometry', async () => {
  const f = fixture();
  await f.port.manage(await f.request('attach'));
  f.chat.at = [0, -1000];
  f.chat.workspaceId = 8;
  await f.bridge.refresh(f.peer);
  assert.equal(f.client.workspace, 'special:ce-chat-holding');
  await f.port.manage(await f.request('reattach'));
  assert.deepEqual(f.client.at, [200, -900]);
  assert.equal(f.client.workspaceId, 8);
  assert.deepEqual(f.calls, ['switch', 'park', 'switch']);
});

test('stale or mismatched layout revokes the port and parks an owned overlay', async () => {
  for (const change of [{ observedAt: 1 }, { contentMatchesWindow: false }, { compositorSize: [1599, 1000] }, { windowId: '0xbad' }]) {
    const f = fixture();
    await f.port.manage(await f.request('attach'));
    Object.assign(f.layout, change);
    await assert.rejects(f.bridge.refresh(f.peer), /geometry|frame/);
    assert.equal(f.client.workspace, 'special:ce-chat-holding');
    await assert.rejects(f.port.observe(), /revoked/);
  }
});

test('Chat window/process replacement revokes its old authority without touching provider processes', async () => {
  const f = fixture();
  await f.port.manage(await f.request('attach'));
  f.chat.nativeSessionId = 'replacement-process';
  await assert.rejects(f.bridge.refresh(f.peer), /identity/);
  assert.equal(f.client.workspace, 'special:ce-chat-holding');
  assert.equal(f.client.nativeSessionId, 'process-2');
});

test('provider restart cannot masquerade as Return to Lab; explicit attach reacquires it', async () => {
  const f = fixture();
  await f.port.manage(await f.request('attach'));
  await f.port.manage(await f.request('open-standalone'));
  f.client.nativeSessionId = 'restarted-process';
  f.client.windowId = '0x3';
  await assert.rejects(f.port.manage(await f.request('reattach')), /session changed/);
  const ack = await f.port.manage(await f.request('attach', 'fresh-attach'));
  assert.equal(ack.nativeSessionId, 'restarted-process');
});

test('caller cannot smuggle geometry, acceptance, or commands through manage', async () => {
  const f = fixture();
  for (const input of [{ x: 9000 }, { acceptancePassed: true }, { executable: '/tmp/untrusted' }, { command: 'exit' }]) {
    await assert.rejects(f.port.manage({ ...await f.request('attach', `bad-${Object.keys(input)[0]}`), ...input }), /fields/);
  }
  assert.deepEqual(f.calls, []);
});

test('trusted scale mapping accepts exact edges and refuses clipping or unproven rounding', () => {
  const f = fixture();
  const resolve = () => resolveNativeDeskSlot({ window: f.chat, identity: f.chat, layout: f.layout, now: f.now });
  f.layout.viewport = { width: 800, height: 500 };
  f.layout.rect = { x: 100, y: 50, width: 600, height: 400 };
  assert.equal(resolve().width, 1200);
  f.layout.rect.x = -1;
  assert.throws(resolve, /outside/);
  f.layout.rect = { x: 0.1, y: 50, width: 600, height: 400 };
  assert.throws(resolve, /Fractional/);
  f.layout.rect = { x: 100, y: 50, width: 800, height: 400 };
  assert.throws(resolve, /outside/);
});

test('close revokes queued requests while allowing a dispatched switch to settle then park', async () => {
  const f = fixture();
  const request = await f.request('attach');
  let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const original = f.backend.switch;
  f.backend.switch = async args => { entered(); await gate; return original(args); };
  const attach = f.port.manage(request);
  await ready;
  const queued = f.port.manage({ ...request, requestId: 'queued' });
  const rejected = assert.rejects(queued, /revoked/);
  const close = f.bridge.close(f.peer);
  release();
  await Promise.all([attach, rejected, close]);
  assert.deepEqual(f.calls, ['switch', 'park']);
});
