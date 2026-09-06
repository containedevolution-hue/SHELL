// Shell-owned native desk and observation protocol. Validation is not authentication.
export const CONTRACT = 'com.containedevolution.shell.chat';
export const VERSION = 2;
export const DESK_ACTIONS = Object.freeze(['attach', 'detach', 'open-standalone', 'reattach']);
export const CLIENT_STATES = Object.freeze(['not-running', 'attached', 'parked', 'standalone', 'unavailable']);
export const HEALTH_CHECKS = Object.freeze(['application-found', 'application-running', 'window-attached', 'shell-permissions', 'remote-session']);

function id(value, label) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9._:-]{1,160}$/.test(value)) throw new Error(`Invalid ${label}.`);
  return value;
}
function text(value, label, max = 160) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) throw new Error(`Invalid ${label}.`);
  return value.trim();
}
function time(value, label) {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`Invalid ${label}.`);
  return value;
}

export function validateSnapshot(input, now = Date.now()) {
  if (!input || input.contract !== CONTRACT || input.version !== VERSION || !['shell', 'fixture'].includes(input.source)) throw new Error('Unsupported Chat host contract.');
  const observed = Date.parse(input.observedAt), expires = Date.parse(input.expiresAt);
  if (!Number.isFinite(observed) || !Number.isFinite(expires) || observed > now + 30000 || expires <= now || expires <= observed || expires - observed > 300000) throw new Error('Host observation is expired or invalid.');
  if (!Array.isArray(input.connections) || input.connections.length > 30) throw new Error('Invalid host capabilities.');
  const connections = input.connections.map(c => {
    if (!c || !['api', 'mcp', 'local-model'].includes(c.kind) || !['available', 'unavailable'].includes(c.state)) throw new Error('Invalid connection observation.');
    if ((c.state === 'available' && (!Number.isSafeInteger(c.count) || c.count < 0)) || (c.state === 'unavailable' && c.count !== null)) throw new Error('Invalid connection count.');
    return { kind: c.kind, state: c.state, count: c.count, label: text(c.label, 'connection label'), detail: text(c.detail, 'connection detail') };
  });
  if (new Set(connections.map(c => c.kind)).size !== connections.length) throw new Error('Duplicate connection observation.');
  let remote = null;
  if (input.remote !== null) {
    if (!input.remote || !['connected', 'disconnected', 'connecting'].includes(input.remote.state)) throw new Error('Invalid remote observation.');
    remote = { sessionId: id(input.remote.sessionId, 'remote session'), targetLabel: text(input.remote.targetLabel, 'remote target'), state: input.remote.state };
  }
  let deskManager = null;
  if (input.deskManager !== null) {
    const manager = input.deskManager;
    if (!manager || manager.mode !== 'native-window-slot' || !['available', 'unavailable'].includes(manager.state) || manager.capabilityPolicy !== 'preserve-native' || manager.lifecycle !== 'detach-on-chat-close') throw new Error('Invalid native desk manager.');
    if (!Array.isArray(manager.actions) || new Set(manager.actions).size !== manager.actions.length || manager.actions.some(action => !DESK_ACTIONS.includes(action))) throw new Error('Invalid native desk actions.');
    if (manager.state === 'available' && !DESK_ACTIONS.every(action => manager.actions.includes(action))) throw new Error('Available desk manager is missing a required reversible action.');
    if (manager.state === 'unavailable' && manager.actions.length) throw new Error('Unavailable desk manager cannot advertise actions.');
    deskManager = { mode: manager.mode, state: manager.state, slotId: id(manager.slotId, 'desk slot'), compositor: text(manager.compositor, 'compositor'), capabilityPolicy: manager.capabilityPolicy, lifecycle: manager.lifecycle, actions: [...manager.actions] };
  }
  if (!Array.isArray(input.clients) || input.clients.length > 50) throw new Error('Invalid native client observations.');
  const clients = input.clients.map(client => {
    if (!client || !CLIENT_STATES.includes(client.state) || !['native-complete', 'unknown', 'degraded'].includes(client.capabilityState)) throw new Error('Invalid native client observation.');
    const requiresWindow = ['attached', 'parked', 'standalone'].includes(client.state);
    if (requiresWindow !== Boolean(client.nativeSessionId && client.windowId)) throw new Error('Invalid native client window identity.');
    if (client.state === 'attached' && client.capabilityState !== 'native-complete') throw new Error('A degraded client cannot occupy the lab slot.');
    return { clientId: id(client.clientId, 'native client'), label: text(client.label, 'native client label'), state: client.state,
      nativeSessionId: client.nativeSessionId === null ? null : id(client.nativeSessionId, 'native session'),
      windowId: client.windowId === null ? null : id(client.windowId, 'native window'), capabilityState: client.capabilityState, detail: text(client.detail, 'native client detail') };
  });
  if (new Set(clients.map(client => client.clientId)).size !== clients.length || clients.filter(client => client.state === 'attached').length > 1) throw new Error('Conflicting native client observations.');
  if ((!deskManager || deskManager.state !== 'available') && clients.some(client => client.state === 'attached')) throw new Error('A client cannot be attached without an available desk manager.');
  return { contract: CONTRACT, version: VERSION, source: input.source, hostId: id(input.hostId, 'host'), hostSessionId: id(input.hostSessionId, 'host session'),
    observedAt: input.observedAt, expiresAt: input.expiresAt,
    statusBar: input.statusBar === null ? null : { title: text(input.statusBar?.title, 'Status Bar title'), detail: text(input.statusBar?.detail, 'Status Bar detail') },
    connections, remote, deskManager, clients };
}

export function validateContext(input) {
  if (!input || input.appId !== 'chat' || !['home', 'desk', 'seed', 'troubleshoot'].includes(input.view)) throw new Error('Invalid Chat surface context.');
  return { appId: 'chat', view: input.view, deskId: input.deskId === null ? null : id(input.deskId, 'desk'), title: text(input.title, 'surface title') };
}

export function validateDeskRequest(input, snapshot) {
  if (!input || input.hostSessionId !== snapshot.hostSessionId || !DESK_ACTIONS.includes(input.action) || input.preserveCapabilities !== true || input.slotId !== snapshot.deskManager?.slotId) throw new Error('Invalid native desk request.');
  if (snapshot.deskManager?.state !== 'available' || !snapshot.deskManager.actions.includes(input.action)) throw new Error('Native desk management is unavailable.');
  if (input.returnTo?.appId !== 'chat' || input.returnTo?.view !== 'home') throw new Error('Invalid return target.');
  return { requestId: id(input.requestId, 'request'), hostSessionId: snapshot.hostSessionId, deskId: id(input.deskId, 'desk'), clientId: id(input.clientId, 'native client'), action: input.action,
    slotId: input.slotId, preserveCapabilities: true, returnTo: { appId: 'chat', view: 'home', deskId: id(input.returnTo.deskId, 'return desk') } };
}

export function validateDeskAck(input, request, snapshot) {
  const expectedState = { attach: 'attached', reattach: 'attached', detach: 'parked', 'open-standalone': 'standalone' }[request.action];
  if (!input || input.requestId !== request.requestId || input.hostSessionId !== snapshot.hostSessionId || input.deskId !== request.deskId || input.clientId !== request.clientId || input.action !== request.action || input.status !== 'completed' || input.state !== expectedState || input.capabilityState !== 'native-complete') throw new Error('Native desk acknowledgement does not match this request.');
  return { requestId: request.requestId, hostSessionId: snapshot.hostSessionId, deskId: request.deskId, clientId: request.clientId, action: request.action, status: 'completed', state: expectedState,
    nativeSessionId: id(input.nativeSessionId, 'native session'), windowId: id(input.windowId, 'native window'), capabilityState: 'native-complete' };
}

export function validateHealthRequest(input, snapshot) {
  if (!input || input.hostSessionId !== snapshot.hostSessionId || snapshot.deskManager?.state !== 'available') throw new Error('Invalid desk health request.');
  return { requestId: id(input.requestId, 'request'), hostSessionId: snapshot.hostSessionId, deskId: id(input.deskId, 'desk'), clientId: id(input.clientId, 'native client') };
}

export function validateHealthReport(input, request, snapshot) {
  if (!input || input.requestId !== request.requestId || input.hostSessionId !== snapshot.hostSessionId || input.deskId !== request.deskId || input.clientId !== request.clientId || !Array.isArray(input.checks) || input.checks.length > HEALTH_CHECKS.length) throw new Error('Invalid desk health report.');
  const checks = input.checks.map(check => {
    if (!check || !HEALTH_CHECKS.includes(check.id) || !['pass', 'fail', 'unknown'].includes(check.state)) throw new Error('Invalid desk health check.');
    return { id: check.id, state: check.state, detail: text(check.detail, 'health detail') };
  });
  if (new Set(checks.map(check => check.id)).size !== checks.length) throw new Error('Duplicate desk health check.');
  return { requestId: request.requestId, hostSessionId: snapshot.hostSessionId, deskId: request.deskId, clientId: request.clientId, observedAt: time(input.observedAt, 'health observation time'), checks };
}
