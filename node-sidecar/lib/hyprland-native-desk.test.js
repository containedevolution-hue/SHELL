'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createHyprlandBackend, processStartTime, sessionId } = require('./hyprland-native-desk');

test('backend is honestly unavailable off Linux, when disabled, or with an unverified dialect', async () => {
  assert.equal((await createHyprlandBackend({ platform: 'win32', enabled: true, dialect: 'legacy-0.55', env: { HYPRLAND_INSTANCE_SIGNATURE: 'x' } }).probe()).available, false);
  assert.equal((await createHyprlandBackend({ platform: 'linux', enabled: false, dialect: 'legacy-0.55', env: { HYPRLAND_INSTANCE_SIGNATURE: 'x' } }).probe()).available, false);
  assert.equal((await createHyprlandBackend({ platform: 'linux', enabled: true, dialect: 'guess', env: { HYPRLAND_INSTANCE_SIGNATURE: 'x' } }).probe()).available, false);
  const wrongVersion = createHyprlandBackend({ platform: 'linux', enabled: true, dialect: 'legacy-0.55', env: { HYPRLAND_INSTANCE_SIGNATURE: 'x' }, run: async (_file, args) => args.includes('version') ? JSON.stringify({ tag: 'v0.56.0' }) : '[]' });
  assert.equal((await wrongVersion.probe()).available, false);
});

test('backend derives stable process identity and controls windows only by compositor address', async () => {
  const calls = [];
  const clients = [{ address: '0xABC', pid: 42, initialClass: 'Codex', title: 'mutable title', workspace: { name: 'special:ce-chat-holding' }, at: [0, 0], size: [900, 600], floating: true }];
  const run = async (_file, args) => {
    calls.push(args);
    if (args.includes('version')) return JSON.stringify({ tag: 'v0.55.0' });
    if (args.includes('clients')) return JSON.stringify(clients);
    return Array(6).fill('ok').join('\n');
  };
  const backend = createHyprlandBackend({ platform: 'linux', enabled: true, dialect: 'legacy-0.55', env: { HYPRLAND_INSTANCE_SIGNATURE: 'instance' }, run,
    readlink: async () => '/opt/codex/codex', readFile: async () => '42 (codex helper) S 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 999 20', access: async () => {} });
  assert.equal((await backend.probe()).available, true);
  const window = (await backend.listWindows())[0];
  assert.equal(window.windowId, '0xabc');
  assert.equal(window.processExecutable, '/opt/codex/codex');
  assert.match(window.nativeSessionId, /^process-42-/);
  await backend.switch({ park: null, target: window, slot: { workspace: 'name:chat-lab', width: 1200, height: 800, x: 300, y: 100 } });
  const command = calls.at(-1);
  assert.deepEqual(command.slice(0, 1), ['--batch']);
  assert.match(command[1], /address:0xabc/);
  assert.doesNotMatch(command[1], /mutable title|Codex/);
  assert.doesNotMatch(command[1], /kill|closewindow|forcekill/);
});

test('process stat parsing uses the start-time field even when the process name contains spaces', async () => {
  const value = await processStartTime(42, async () => '42 (name with spaces) S 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 424242 20');
  assert.equal(value, '424242');
  assert.equal(sessionId(42, value, '/opt/app'), sessionId(42, value, '/opt/app'));
  assert.notEqual(sessionId(42, value, '/opt/app'), sessionId(42, 'other', '/opt/app'));
});

test('workspace identity uses compositor ids or exact named workspaces', () => {
  const backend = createHyprlandBackend();
  const window = { workspace: 'chat-lab', workspaceId: 4, floating: true, at: [-1000, 0], size: [900, 600] };
  const slot = { workspace: '4', x: -1000, y: 0, width: 900, height: 600 };
  assert.equal(backend.location(window, slot), 'attached');
  assert.equal(backend.location(window, { ...slot, workspace: 'name:chat-lab' }), 'attached');
  assert.equal(backend.location(window, { ...slot, workspace: '5' }), 'standalone');
});

test('launch errors reject safely without an unhandled child-process error', async () => {
  const { EventEmitter } = require('node:events');
  const backend = createHyprlandBackend({ access: async () => {}, spawnProcess: () => {
    const child = new EventEmitter();
    process.nextTick(() => child.emit('error', new Error('launch denied')));
    return child;
  } });
  await assert.rejects(backend.launch({ executable: '/fixture/provider', args: [] }), /launch denied/);
});

test('inventory drops a pid recycled during proc inspection', async () => {
  let reads = 0;
  const backend = createHyprlandBackend({ run: async () => JSON.stringify([{ pid: 42, address: '0x1', initialClass: 'Fixture' }]),
    readlink: async () => '/fixture/app',
    readFile: async () => `42 (fixture) S 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 ${++reads} 20` });
  assert.deepEqual(await backend.listWindows(), []);
});
