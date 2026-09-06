const test = require('node:test');
const assert = require('node:assert/strict');

const now = Date.parse('2026-09-06T20:00:00Z');
const base = {
  contract: 'com.containedevolution.shell.chat', version: 2, source: 'shell', hostId: 'host', hostSessionId: 'session',
  observedAt: new Date(now).toISOString(), expiresAt: new Date(now + 60000).toISOString(), statusBar: null, connections: [], remote: null,
  deskManager: { mode: 'native-window-slot', state: 'available', slotId: 'chat-primary', compositor: 'Hyprland', capabilityPolicy: 'preserve-native', lifecycle: 'detach-on-chat-close', actions: ['attach', 'detach', 'open-standalone', 'reattach'] },
  clients: [{ clientId: 'codex', label: 'Codex', state: 'parked', nativeSessionId: 'process-1', windowId: 'window-1', capabilityState: 'native-complete', detail: 'Running outside the active slot.' }],
};

test('v2 admits one complete native client and rejects retired or degraded containment', async () => {
  const { validateSnapshot } = await import('../contracts/chat/v2.mjs');
  const snapshot = validateSnapshot(base, now);
  assert.equal(snapshot.deskManager.mode, 'native-window-slot');
  assert.throws(() => validateSnapshot({ ...base, version: 1 }, now));
  assert.throws(() => validateSnapshot({ ...base, deskManager: { ...base.deskManager, mode: 'contained' } }, now));
  assert.throws(() => validateSnapshot({ ...base, deskManager: { ...base.deskManager, actions: [...base.deskManager.actions, 'terminate'] } }, now));
  assert.throws(() => validateSnapshot({ ...base, deskManager: { ...base.deskManager, state: 'unavailable' } }, now));
  assert.throws(() => validateSnapshot({ ...base, deskManager: null, clients: [{ ...base.clients[0], state: 'attached' }] }, now));
  assert.throws(() => validateSnapshot({ ...base, clients: [{ ...base.clients[0], state: 'attached', capabilityState: 'degraded' }] }, now), /degraded/);
  assert.throws(() => validateSnapshot({ ...base, clients: [{ ...base.clients[0], state: 'attached' }, { ...base.clients[0], clientId: 'claude', state: 'attached' }] }, now), /Conflicting/);
});

test('native desk requests bind identity, slot and preservation policy', async () => {
  const { validateSnapshot, validateDeskRequest } = await import('../contracts/chat/v2.mjs');
  const snapshot = validateSnapshot(base, now);
  const input = { requestId: 'request-1', hostSessionId: 'session', deskId: 'desk-codex', clientId: 'codex', action: 'attach', slotId: 'chat-primary', preserveCapabilities: true, returnTo: { appId: 'chat', view: 'home', deskId: 'desk-codex' } };
  assert.equal(validateDeskRequest(input, snapshot).action, 'attach');
  for (const change of [{ action: 'terminate' }, { preserveCapabilities: false }, { slotId: 'other' }, { hostSessionId: 'other' }]) assert.throws(() => validateDeskRequest({ ...input, ...change }, snapshot));
  assert.throws(() => validateDeskRequest({ ...input, action: 'embed', url: 'https://example.com' }, snapshot));
});

test('switch lifecycle acknowledgements preserve one complete native session', async () => {
  const { validateSnapshot, validateDeskRequest, validateDeskAck } = await import('../contracts/chat/v2.mjs');
  const snapshot = validateSnapshot(base, now);
  const make = action => validateDeskRequest({ requestId: `request-${action}`, hostSessionId: 'session', deskId: 'desk-codex', clientId: 'codex', action, slotId: 'chat-primary', preserveCapabilities: true, returnTo: { appId: 'chat', view: 'home', deskId: 'desk-codex' } }, snapshot);
  for (const [action, state] of [['attach', 'attached'], ['detach', 'parked'], ['open-standalone', 'standalone'], ['reattach', 'attached']]) {
    const request = make(action);
    const ack = validateDeskAck({ ...request, status: 'completed', state, nativeSessionId: 'process-1', windowId: 'window-1', capabilityState: 'native-complete' }, request, snapshot);
    assert.equal(ack.nativeSessionId, 'process-1');
    assert.equal(ack.state, state);
  }
  const request = make('attach');
  assert.throws(() => validateDeskAck({ ...request, status: 'completed', state: 'attached', nativeSessionId: 'new-process', windowId: 'window-1', capabilityState: 'degraded' }, request, snapshot));
});

test('health reports stay observational and cannot invent provider account state', async () => {
  const { validateSnapshot, validateDeskRequest, validateHealthReport } = await import('../contracts/chat/v2.mjs');
  const snapshot = validateSnapshot(base, now);
  const request = validateDeskRequest({ requestId: 'health-1', hostSessionId: 'session', deskId: 'desk-codex', clientId: 'codex', action: 'open-standalone', slotId: 'chat-primary', preserveCapabilities: true, returnTo: { appId: 'chat', view: 'home', deskId: 'desk-codex' } }, snapshot);
  const report = validateHealthReport({ requestId: 'health-1', hostSessionId: 'session', deskId: 'desk-codex', clientId: 'codex', observedAt: new Date(now).toISOString(), checks: [
    { id: 'application-found', state: 'pass', detail: 'Registered application found.' },
    { id: 'window-attached', state: 'unknown', detail: 'Testing in the standalone workspace.' },
  ] }, request, snapshot);
  assert.equal(report.checks.length, 2);
  assert.throws(() => validateHealthReport({ ...report, checks: [{ id: 'account', state: 'pass', detail: 'Assumed account.' }] }, request, snapshot));
});

test('context cannot smuggle lifecycle commands and observations expire', async () => {
  const { validateSnapshot, validateContext } = await import('../contracts/chat/v2.mjs');
  assert.throws(() => validateSnapshot(base, now + 60000), /expired/);
  assert.deepEqual(validateContext({ appId: 'chat', view: 'troubleshoot', deskId: 'desk-codex', title: 'Troubleshoot Codex', shutdown: true }), { appId: 'chat', view: 'troubleshoot', deskId: 'desk-codex', title: 'Troubleshoot Codex' });
});
