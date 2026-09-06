const test = require('node:test');
const assert = require('node:assert/strict');
test('Chat host observations expire and cannot carry forged launch acknowledgements', async () => {
  const { CONTRACT, validateSnapshot, validateContext, validateLaunchAck } = await import('../contracts/chat/v1.mjs');
  const now = Date.parse('2026-09-06T20:00:00Z');
  const wire = { contract: CONTRACT, version: 1, source: 'shell', hostId: 'host', hostSessionId: 'session', observedAt: new Date(now).toISOString(), expiresAt: new Date(now + 60000).toISOString(), statusBar: null, connections: [], remote: null, launchRoutes: ['secure-browser'] };
  const snapshot = validateSnapshot(wire, now);
  assert.throws(() => validateSnapshot(wire, now + 60000), /expired/);
  assert.throws(() => validateSnapshot({ ...wire, version: 2 }, now));
  assert.throws(() => validateSnapshot({ ...wire, connections: [{ kind: 'api', state: 'unavailable', count: 2, label: 'API', detail: 'Unavailable' }] }, now));
  assert.deepEqual(validateContext({ appId: 'chat', view: 'home', deskId: null, title: 'Chat', shutdown: true }), { appId: 'chat', view: 'home', deskId: null, title: 'Chat' });
  const request = { requestId: 'request', url: 'https://claude.ai/' };
  const ack = { ...request, hostSessionId: 'session', route: 'secure-browser', status: 'opened' };
  assert.equal(validateLaunchAck(ack, request, snapshot).status, 'opened');
  for (const change of [{ requestId: 'other' }, { hostSessionId: 'other' }, { url: 'https://evil.example' }, { route: 'contained' }]) assert.throws(() => validateLaunchAck({ ...ack, ...change }, request, snapshot));
});
