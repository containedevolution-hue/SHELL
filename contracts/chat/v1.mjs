// Shell-owned public observation and launch protocol. Validation is not authentication.
export const CONTRACT = 'com.containedevolution.shell.chat';
export const VERSION = 1;
export const ROUTES = Object.freeze(['secure-browser', 'external-client', 'contained']);
function id(value, label) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9._:-]{1,160}$/.test(value)) throw new Error(`Invalid ${label}.`);
  return value;
}
function text(value, label, max = 160) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) throw new Error(`Invalid ${label}.`);
  return value.trim();
}
export function validateSnapshot(input, now = Date.now()) {
  if (!input || input.contract !== CONTRACT || input.version !== VERSION || !['shell', 'fixture'].includes(input.source)) throw new Error('Unsupported Chat host contract.');
  const observed = Date.parse(input.observedAt), expires = Date.parse(input.expiresAt);
  if (!Number.isFinite(observed) || !Number.isFinite(expires) || observed > now + 30000 || expires <= now || expires <= observed || expires - observed > 300000) throw new Error('Host observation is expired or invalid.');
  if (!Array.isArray(input.connections) || input.connections.length > 30 || !Array.isArray(input.launchRoutes) || new Set(input.launchRoutes).size !== input.launchRoutes.length || input.launchRoutes.some(route => !ROUTES.includes(route))) throw new Error('Invalid host capabilities.');
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
  return { contract: CONTRACT, version: VERSION, source: input.source, hostId: id(input.hostId, 'host'), hostSessionId: id(input.hostSessionId, 'host session'),
    observedAt: input.observedAt, expiresAt: input.expiresAt,
    statusBar: input.statusBar === null ? null : { title: text(input.statusBar?.title, 'Status Bar title'), detail: text(input.statusBar?.detail, 'Status Bar detail') },
    connections, remote, launchRoutes: [...input.launchRoutes] };
}
export function validateContext(input) {
  if (!input || input.appId !== 'chat' || !['home', 'desk', 'seed'].includes(input.view)) throw new Error('Invalid Chat surface context.');
  return { appId: 'chat', view: input.view, deskId: input.deskId === null ? null : id(input.deskId, 'desk'), title: text(input.title, 'surface title') };
}
export function validateLaunchAck(input, request, snapshot) {
  if (!input || input.requestId !== request.requestId || input.hostSessionId !== snapshot.hostSessionId || input.url !== request.url || !snapshot.launchRoutes.includes(input.route) || input.status !== 'opened') throw new Error('Host launch acknowledgement does not match this request.');
  return { requestId: request.requestId, hostSessionId: snapshot.hostSessionId, url: request.url, route: input.route, status: 'opened' };
}
