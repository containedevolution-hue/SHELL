'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createRegistry } = require('./native-desk-registry');
const { createNativeDeskManager, matches } = require('./native-desk-manager');
const { createWindowsBackend, windowsRelative } = require('./windows-native-desk');

const slot = { id: 'chat-primary', x: -1200, y: 120, width: 1000, height: 760,
  workspace: 'windows:current', holdingWorkspace: 'windows:minimized', standaloneWorkspace: 'windows:standalone' };
const validation = evidence => ({ status: 'passed', validatedAt: '2026-09-07T02:00:00Z', evidence });

function registry() {
  const windows = (family, app, executable, evidence) => ({ packageFamilyName: family, applicationUserModelId: `${family}!${app}`,
    relativeExecutables: [executable], windowClasses: ['Chrome_WidgetWin_1'], validation: validation(evidence) });
  return createRegistry({ contract: 'com.containedevolution.shell.native-clients', version: 2, clients: [
    { clientId: 'chatgpt', label: 'ChatGPT', identities: { windows: windows('OpenAI.Codex_2p2nqsd0c76g0', 'App', 'app/ChatGPT.exe', 'Synthetic Windows ChatGPT acceptance.') } },
    { clientId: 'claude', label: 'Claude', identities: { windows: windows('Claude_pzs8sxrjxfjjc', 'Claude', 'app/Claude.exe', 'Synthetic Windows Claude acceptance.') } },
  ] }, 'win32');
}

function raw(clientId, overrides = {}) {
  const isClaude = clientId === 'claude';
  const family = isClaude ? 'Claude_pzs8sxrjxfjjc' : 'OpenAI.Codex_2p2nqsd0c76g0';
  const app = isClaude ? 'Claude' : 'App';
  const exe = isClaude ? 'Claude.exe' : 'ChatGPT.exe';
  const version = overrides.version || (isClaude ? '1.46388.4.0' : '26.901.6511.0');
  const fullName = `${family.split('_')[0]}_${version}_x64__${family.split('_').at(-1)}`;
  const root = `C:\\Program Files\\WindowsApps\\${fullName}`;
  const bounds = overrides.visualBounds || (overrides.iconic ? [200, 180, 900, 700] : [240, 160, 900, 700]);
  const base = {
    pid: isClaude ? 22 : 11, processStartTime: isClaude ? '200' : '100', hwnd: isClaude ? '0x22' : '0x11',
    packageFamilyName: family, applicationUserModelId: `${family}!${app}`, packageFullName: fullName,
    packageInstallRoot: root, processExecutable: `${root}\\app\\${exe}`, packageStatus: 'ok', signatureTrusted: true,
    windowClass: 'Chrome_WidgetWin_1', rootHwnd: isClaude ? '0x22' : '0x11', ownerHwnd: '0x0', userWindow: true,
    visible: true, iconic: false, cloaked: false, elevated: false, onCurrentDesktop: true, controllable: true,
    visualBounds: bounds, dpi: 144, focused: false, placement: { show: 'normal', bounds: [...bounds] }, title: 'mutable and ignored',
  };
  return { ...base, ...overrides };
}

function fakeDriver(initial) {
  const windows = initial.map(value => structuredClone(value));
  const calls = [];
  let fail = null;
  const find = guard => windows.find(item => item.hwnd.toLowerCase() === guard.hwnd && item.pid === guard.pid && item.processStartTime === guard.processStartTime && item.packageFullName === guard.packageFullName);
  const driver = {
    probe: async () => ({ available: true, name: 'Windows fake driver' }),
    listWindows: async () => structuredClone(windows),
    applicationFound: async identity => { calls.push(['found', identity.applicationUserModelId]); return true; },
    activate: async identity => { calls.push(['activate', identity.applicationUserModelId]); },
    minimize: async guard => { const item = find(guard); calls.push(['minimize', guard.hwnd]); item.iconic = true; item.focused = false; if (fail === 'minimize') throw new Error('lost minimize reply'); },
    restore: async (guard, placement) => { const item = find(guard); calls.push(['restore', guard.hwnd, placement ? 'placement' : 'normal']); item.iconic = false; item.visible = true;
      if (placement) { item.placement = structuredClone(placement); item.visualBounds = [...placement.bounds]; } if (fail === 'restore') throw new Error('lost restore reply'); },
    place: async (guard, rect) => { const item = find(guard); calls.push(['place', guard.hwnd]); item.visualBounds = [rect.x, rect.y, rect.width, rect.height]; item.placement = { show: 'normal', bounds: [...item.visualBounds] };
      if (fail === 'place') throw new Error('lost placement reply'); },
    focus: async guard => { const item = find(guard); calls.push(['focus', guard.hwnd]); windows.forEach(value => { value.focused = false; }); item.focused = true;
      if (fail === 'focus') throw new Error('lost focus reply'); return true; },
  };
  return { driver, windows, calls, setFailure: value => { fail = value; } };
}

function backend(fixture) {
  return createWindowsBackend({ platform: 'win32', env: { SHELL_CHAT_NATIVE_DESK: 'enabled' }, driver: fixture.driver, driverAccepted: true, waitMs: 20, pollMs: 1 });
}

function manager(fixture, accepted = true) {
  return createNativeDeskManager({ registry: registry(), backend: backend(fixture), slot, hostId: 'shell-1', hostSessionId: 'session-1', accepted,
    now: () => Date.parse('2026-09-07T02:00:00Z') });
}

const request = (clientId, action, requestId = `${clientId}-${action}`) => ({ requestId, hostSessionId: 'session-1', deskId: `desk-${clientId}`,
  clientId, action, slotId: 'chat-primary', preserveCapabilities: true, returnTo: { appId: 'chat', view: 'home', deskId: `desk-${clientId}` } });

test('Windows backend is default-off and refuses unaccepted or command-capable drivers', async () => {
  const fixture = fakeDriver([]);
  assert.equal((await createWindowsBackend({ platform: 'linux', enabled: true, driver: fixture.driver, driverAccepted: true }).probe()).available, false);
  assert.equal((await createWindowsBackend({ platform: 'win32', enabled: false, driver: fixture.driver, driverAccepted: true }).probe()).available, false);
  assert.equal((await createWindowsBackend({ platform: 'win32', enabled: true, driver: fixture.driver }).probe()).available, false);
  const dangerous = { ...fixture.driver, terminate: async () => {} };
  assert.equal((await createWindowsBackend({ platform: 'win32', enabled: true, driver: dangerous, driverAccepted: true }).probe()).available, false);
  assert.deepEqual(Object.keys(backend(fixture)).filter(key => /kill|terminate|close|hide|setParent|execute|command/i.test(key)), []);
});

test('identity uses exact package, AUMID, package-relative executable and class while ignoring title and helpers', async () => {
  const good = raw('chatgpt');
  const fixture = fakeDriver([good,
    raw('chatgpt', { hwnd: '0x12', rootHwnd: '0x12', packageFamilyName: 'Chrome_fake', applicationUserModelId: 'Chrome_fake!PWA' }),
    raw('chatgpt', { hwnd: '0x13', rootHwnd: '0x13', windowClass: 'Chrome_WidgetWin_0', visible: false }),
    raw('chatgpt', { hwnd: '0x14', rootHwnd: '0x14', processExecutable: 'C:\\Users\\person\\codex.exe' })]);
  const windows = await backend(fixture).listWindows();
  const entry = registry().get('chatgpt');
  assert.equal(windows.filter(window => matches(entry, window)).length, 1);
  assert.equal(matches(entry, { ...windows[0], title: 'Claude' }), true);
  assert.equal(matches(entry, { ...windows[0], applicationUserModelId: 'OpenAI.Codex_2p2nqsd0c76g0!Other' }), false);
});

test('versioned package updates preserve identity but an executable outside its exact package root is rejected', async () => {
  const first = raw('chatgpt');
  const updated = raw('chatgpt', { version: '27.100.1.0', pid: 33, processStartTime: '300', hwnd: '0x33', rootHwnd: '0x33' });
  const escaped = raw('chatgpt', { processExecutable: 'C:\\Program Files\\WindowsApps\\Other_1.0_x64__x\\app\\ChatGPT.exe' });
  const listed = await backend(fakeDriver([first, updated, escaped])).listWindows();
  assert.equal(windowsRelative(updated.packageInstallRoot, updated.processExecutable), 'app\\chatgpt.exe');
  assert.equal(listed.length, 2);
  assert.ok(listed.every(window => matches(registry().get('chatgpt'), window)));
  assert.notEqual(listed[0].nativeSessionId, listed[1].nativeSessionId);
});

test('PID, process start and HWND binding defeats recycled-window mutation', async () => {
  const fixture = fakeDriver([raw('chatgpt')]);
  const host = backend(fixture);
  const before = (await host.listWindows())[0];
  fixture.windows[0].processStartTime = 'recycled';
  await assert.rejects(host.park(before, slot), /identity changed/);
  assert.deepEqual(fixture.calls, []);
});

test('multiple exact provider windows are refused rather than selected by mutable title', async () => {
  const fixture = fakeDriver([raw('chatgpt'), raw('chatgpt', { hwnd: '0x15', rootHwnd: '0x15' })]);
  const host = manager(fixture);
  const snapshot = await host.observe();
  assert.equal(snapshot.clients.find(client => client.clientId === 'chatgpt').state, 'unavailable');
  await assert.rejects(host.manage(request('chatgpt', 'attach')), /Multiple registered windows/);
  assert.deepEqual(fixture.calls, []);
});

test('switch verifies park before place and A-B-A preserves both exact sessions', async () => {
  const fixture = fakeDriver([raw('chatgpt', { visualBounds: [slot.x, slot.y, slot.width, slot.height], focused: true }), raw('claude', { iconic: true })]);
  const host = manager(fixture);
  const initial = await host.observe();
  const chatgpt = initial.clients.find(client => client.clientId === 'chatgpt');
  const claude = initial.clients.find(client => client.clientId === 'claude');
  const b = await host.manage(request('claude', 'attach'));
  const a = await host.manage(request('chatgpt', 'attach', 'return-a'));
  assert.deepEqual(fixture.calls.filter(call => ['minimize', 'place'].includes(call[0])).map(call => call[0]), ['minimize', 'place', 'minimize', 'place']);
  assert.equal(b.nativeSessionId, claude.nativeSessionId);
  assert.equal(a.nativeSessionId, chatgpt.nativeSessionId);
  assert.equal(a.windowId, chatgpt.windowId);
});

test('an unverified park stops a switch before the target can be placed', async () => {
  const fixture = fakeDriver([raw('chatgpt', { visualBounds: [slot.x, slot.y, slot.width, slot.height] }), raw('claude', { iconic: true })]);
  fixture.driver.minimize = async guard => { fixture.calls.push(['minimize-without-effect', guard.hwnd]); };
  await assert.rejects(manager(fixture).manage(request('claude', 'attach')), /minimize outcome is unverified/);
  assert.equal(fixture.calls.some(call => call[0] === 'place'), false);
});

test('standalone restores the same window placement and close only minimizes the running process', async () => {
  const original = [320, 240, 880, 680];
  const fixture = fakeDriver([raw('chatgpt', { visualBounds: original })]);
  const host = manager(fixture);
  const attached = await host.manage(request('chatgpt', 'attach'));
  const standalone = await host.manage(request('chatgpt', 'open-standalone'));
  assert.equal(standalone.nativeSessionId, attached.nativeSessionId);
  assert.deepEqual(fixture.windows[0].visualBounds, original);
  await host.manage(request('chatgpt', 'attach', 'attach-again'));
  await host.closeChat();
  assert.equal(fixture.windows[0].iconic, true);
  assert.equal(fixture.windows.length, 1);
  assert.equal(fixture.calls.some(call => /kill|terminate|close|hide/i.test(call[0])), false);
});

test('lost placement or focus reply enters manager reconciliation before another mutation', async t => {
  for (const failure of ['place', 'focus']) await t.test(failure, async () => {
    const fixture = fakeDriver([raw('chatgpt', { iconic: true })]);
    const host = manager(fixture);
    fixture.setFailure(failure);
    await assert.rejects(host.manage(request('chatgpt', 'attach', `${failure}-lost`)), /lost/);
    fixture.setFailure(null);
    await assert.rejects(host.manage(request('chatgpt', 'detach', `${failure}-blocked`)), /Reconciliation/);
    await host.observe();
    assert.equal((await host.manage(request('chatgpt', 'detach', `${failure}-reconciled`))).state, 'parked');
  });
});

test('placement supports negative monitor coordinates and non-96 DPI without rounding or title selectors', async () => {
  const fixture = fakeDriver([raw('chatgpt', { iconic: true, dpi: 168 })]);
  const ack = await manager(fixture).manage(request('chatgpt', 'attach'));
  assert.equal(ack.state, 'attached');
  assert.deepEqual(fixture.windows[0].visualBounds, [-1200, 120, 1000, 760]);
  assert.equal(JSON.stringify(fixture.calls).includes('mutable'), false);
});

test('elevated and foreign-virtual-desktop windows are observed but denied control', async () => {
  for (const denied of [raw('chatgpt', { elevated: true }), raw('claude', { onCurrentDesktop: false })]) {
    const fixture = fakeDriver([denied]);
    const windows = await backend(fixture).listWindows();
    assert.equal(windows[0].controllable, false);
    assert.equal(matches(registry().get(denied.packageFamilyName.startsWith('Claude') ? 'claude' : 'chatgpt'), windows[0]), false);
    assert.deepEqual(fixture.calls, []);
  }
});
