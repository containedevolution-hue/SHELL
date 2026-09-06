'use strict';

const ACTION_STATE = Object.freeze({ attach: 'attached', reattach: 'attached', detach: 'parked', 'open-standalone': 'standalone' });
const ACTIONS = Object.freeze(Object.keys(ACTION_STATE));
const REQUEST_KEYS = Object.freeze(['requestId', 'hostSessionId', 'deskId', 'clientId', 'action', 'slotId', 'preserveCapabilities', 'returnTo']);

function validId(value, label) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9._:-]{1,160}$/.test(value)) throw new Error(`Invalid ${label}.`);
  return value;
}

function normalizeSlot(input) {
  if (!input || input.id !== 'chat-primary') throw new Error('Invalid native desk slot.');
  for (const key of ['x', 'y', 'width', 'height']) {
    if (!Number.isSafeInteger(input[key]) || input[key] < 0 || (['width', 'height'].includes(key) && input[key] < 320)) throw new Error('Invalid native desk geometry.');
  }
  for (const key of ['workspace', 'holdingWorkspace', 'standaloneWorkspace']) validId(input[key], key);
  return Object.freeze({ ...input });
}

function matches(entry, window) {
  return Boolean(window && Number.isSafeInteger(window.pid) && window.pid > 0 &&
    typeof window.windowId === 'string' && typeof window.nativeSessionId === 'string' &&
    entry.identity.initialClasses.includes(window.initialClass) &&
    entry.identity.processExecutables.includes(window.processExecutable));
}

function createNativeDeskManager({ registry, backend, slot, hostId, hostSessionId, accepted = false, now = Date.now }) {
  if (!registry || !backend) throw new Error('Native desk dependencies are required.');
  const deskSlot = normalizeSlot(slot);
  validId(hostId, 'host');
  validId(hostSessionId, 'host session');
  const requests = new Map();
  const uncertain = new Set();
  let serialized = Promise.resolve();

  async function inventory() {
    const probe = await backend.probe();
    const registered = registry.list();
    if (!probe?.available || !accepted || registered.length === 0) return { probe, available: false, windows: [], clients: registered.map(entry => ({
      clientId: entry.clientId, label: entry.label, state: 'unavailable', nativeSessionId: null, windowId: null,
      capabilityState: 'unknown', detail: !accepted ? 'Native desk acceptance has not passed on this Shell installation.' : registered.length === 0 ? 'No provider application has passed native capability validation.' : 'Hyprland native desk is unavailable.',
    })) };
    const windows = await backend.listWindows();
    const clients = registry.list().map(entry => {
      const found = windows.filter(window => matches(entry, window));
      if (found.length > 1) return { clientId: entry.clientId, label: entry.label, state: 'unavailable', nativeSessionId: null, windowId: null, capabilityState: 'degraded', detail: 'Multiple matching native windows require user selection outside Chat.' };
      if (!found.length) return { clientId: entry.clientId, label: entry.label, state: 'not-running', nativeSessionId: null, windowId: null, capabilityState: 'native-complete', detail: 'Validated application is not running.' };
      const window = found[0];
      const state = backend.location(window, deskSlot);
      return { clientId: entry.clientId, label: entry.label, state, nativeSessionId: window.nativeSessionId, windowId: window.windowId, capabilityState: 'native-complete', detail: backend.describe(window, state) };
    });
    if (clients.filter(client => client.state === 'attached').length > 1) throw new Error('Native desk has conflicting attached clients.');
    return { probe, available: true, windows, clients };
  }

  async function observe() {
    const state = await inventory();
    const observedAt = now();
    if (state.available) uncertain.clear();
    return {
      contract: 'com.containedevolution.shell.chat', version: 2, source: 'shell', hostId, hostSessionId,
      observedAt: new Date(observedAt).toISOString(), expiresAt: new Date(observedAt + 60000).toISOString(),
      statusBar: null, connections: [], remote: null,
      deskManager: {
        mode: 'native-window-slot', state: state.available ? 'available' : 'unavailable', slotId: deskSlot.id,
        compositor: state.probe?.compositor || 'Hyprland unavailable', capabilityPolicy: 'preserve-native', lifecycle: 'detach-on-chat-close',
        actions: state.available ? [...ACTIONS] : [],
      },
      clients: state.clients,
    };
  }

  async function findOne(entry, windows) {
    const found = windows.filter(window => matches(entry, window));
    if (found.length > 1) throw new Error('Multiple registered windows match this client.');
    return found[0] || null;
  }

  async function execute(request) {
    if (!accepted) throw new Error('Native desk acceptance has not passed.');
    if (!request || request.hostSessionId !== hostSessionId || request.slotId !== deskSlot.id || request.preserveCapabilities !== true || !ACTIONS.includes(request.action)) throw new Error('Invalid native desk request.');
    if (Object.keys(request).some(key => !REQUEST_KEYS.includes(key)) || request.returnTo?.appId !== 'chat' || request.returnTo?.view !== 'home' || request.returnTo?.deskId !== request.deskId) throw new Error('Invalid native desk request fields.');
    validId(request.requestId, 'request');
    validId(request.deskId, 'desk');
    const entry = registry.get(validId(request.clientId, 'native client'));
    if (!entry) throw new Error('Native client is not registered.');
    if (uncertain.has(entry.clientId)) throw new Error('Reconciliation is required before another native desk action.');
    const probe = await backend.probe();
    if (!probe?.available) throw new Error('Hyprland native desk is unavailable.');
    let windows = await backend.listWindows();
    let target = await findOne(entry, windows);
    if (!target && request.action === 'attach') {
      await backend.launch(entry);
      target = await backend.waitForWindow(entry, window => matches(entry, window));
      windows = await backend.listWindows();
    }
    if (!target) throw new Error('The registered native application window is not available.');
    const active = [];
    for (const candidate of registry.list()) {
      const window = await findOne(candidate, windows);
      if (window && backend.location(window, deskSlot) === 'attached') active.push(window);
    }
    if (active.length > 1) throw new Error('Native desk has conflicting attached clients.');
    let dispatched = false;
    try {
      if (request.action === 'attach' || request.action === 'reattach') {
        dispatched = true;
        await backend.switch({ park: active[0]?.windowId === target.windowId ? null : active[0] || null, target, slot: deskSlot });
      } else if (request.action === 'detach') {
        dispatched = true;
        await backend.park(target, deskSlot);
      } else {
        dispatched = true;
        await backend.openStandalone(target, deskSlot);
      }
      const after = await backend.listWindows();
      const verified = await findOne(entry, after);
      if (!verified || verified.windowId !== target.windowId || verified.nativeSessionId !== target.nativeSessionId || backend.location(verified, deskSlot) !== ACTION_STATE[request.action]) {
        throw new Error('Native desk action did not reach its verified state.');
      }
      if ((request.action === 'attach' || request.action === 'reattach') && after.some(window => window.windowId !== verified.windowId && backend.location(window, deskSlot) === 'attached')) {
        throw new Error('Native desk switch left multiple attached windows.');
      }
      return { requestId: request.requestId, hostSessionId, deskId: request.deskId, clientId: entry.clientId, action: request.action,
        status: 'completed', state: ACTION_STATE[request.action], nativeSessionId: verified.nativeSessionId, windowId: verified.windowId, capabilityState: 'native-complete' };
    } catch (error) {
      if (dispatched) uncertain.add(entry.clientId);
      throw error;
    }
  }

  function manage(request) {
    try { validId(request?.requestId, 'request'); }
    catch (error) { return Promise.reject(error); }
    const fingerprint = JSON.stringify(request);
    const prior = requests.get(request?.requestId);
    if (prior) {
      if (prior.fingerprint !== fingerprint) return Promise.reject(new Error('A native desk request id cannot be reused.'));
      return prior.result;
    }
    const result = serialized.then(() => execute(request));
    serialized = result.catch(() => {});
    requests.set(request.requestId, { fingerprint, result });
    return result;
  }

  async function health(request) {
    if (!request || request.hostSessionId !== hostSessionId) throw new Error('Invalid native desk health request.');
    validId(request.requestId, 'request');
    validId(request.deskId, 'desk');
    const entry = registry.get(request.clientId);
    if (!entry) throw new Error('Native client is not registered.');
    const state = await inventory();
    const client = state.clients.find(item => item.clientId === entry.clientId);
    const running = Boolean(client?.nativeSessionId);
    return { requestId: request.requestId, hostSessionId, deskId: request.deskId, clientId: entry.clientId, observedAt: new Date(now()).toISOString(), checks: [
      { id: 'application-found', state: await backend.applicationFound(entry) ? 'pass' : 'fail', detail: 'Checked the registered executable path.' },
      { id: 'application-running', state: running ? 'pass' : 'fail', detail: running ? 'Registered process and window found.' : 'No matching process and window found.' },
      { id: 'window-attached', state: client?.state === 'attached' ? 'pass' : 'fail', detail: client?.state === 'attached' ? 'Exact window occupies the Chat slot.' : 'Exact window does not occupy the Chat slot.' },
      { id: 'shell-permissions', state: state.available ? 'pass' : 'fail', detail: state.available ? 'Hyprland control is available to Shell.' : 'Hyprland control is unavailable or unaccepted.' },
      { id: 'remote-session', state: 'unknown', detail: 'Shell has no authorized remote-session observation for this provider client.' },
    ] };
  }

  async function closeChat() {
    const state = await inventory();
    if (!state.available) return;
    const attached = state.clients.filter(client => client.state === 'attached');
    for (const client of attached) {
      const window = state.windows.find(item => item.windowId === client.windowId);
      if (window) await backend.park(window, deskSlot);
    }
  }

  return Object.freeze({ observe, manage, health, closeChat, slot: deskSlot });
}

module.exports = { ACTIONS, ACTION_STATE, createNativeDeskManager, matches, normalizeSlot };
