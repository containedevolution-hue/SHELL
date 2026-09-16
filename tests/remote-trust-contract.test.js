'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const readSchema = name => JSON.parse(fs.readFileSync(path.join(root, 'contracts', 'v1', name), 'utf8'));
const hash = `sha256:${'a'.repeat(64)}`;
const proof = `sha256:${'b'.repeat(64)}`;
const target = { kind: 'remote-host', id: 'host-a', sessionId: 'host-session-a' };
const capability = { id: 'shell.files.read', version: '1.0.0', owner: 'shell', inputSchemaHash: hash };
const contractCapability = { id: capability.id, version: capability.version, inputSchemaHash: hash };
const authentication = { method: 'pairing-key', keyId: 'pair-key-a', proofHash: proof };
const decisionAuthentication = { method: 'local-user-approval', keyId: 'approval-key-a', proofHash: proof };
const receiptAuthentication = { method: 'host-signature', keyId: 'host-key-a', proofHash: proof };
const now = '2026-09-07T12:00:00.000Z';
const later = '2026-09-07T12:05:00.000Z';
const earlier = '2026-09-07T11:59:00.000Z';
const verifyAuthentication = (_kind, record) => record.authentication?.keyId?.endsWith('-a') === true;

const invocation = () => ({
  contractVersion: 1, requestId: 'request-a', correlationId: 'correlation-a', deskId: 'desk-a',
  capability: { ...capability }, target: { ...target }, effect: 'read', grantId: 'grant-a',
  idempotencyKey: 'idem-a', issuedAt: now, input: {},
});
const session = () => ({
  contract: 'com.containedevolution.shell.remote-session/1', contractVersion: 1, sessionId: 'remote-session-a',
  subject: { kind: 'phone', deviceId: 'phone-a' }, target: { ...target }, state: 'active',
  authentication: { ...authentication }, authenticatedAt: earlier, expiresAt: later, revokedAt: null,
});
const observation = () => ({
  contract: 'com.containedevolution.shell.live-capability/1', contractVersion: 1, observationId: 'observation-a',
  capability: { ...contractCapability }, owner: 'shell', target: { ...target }, state: 'available',
  checks: { installed: 'yes', authenticated: 'yes', reachable: 'yes', granted: 'yes', usable: 'yes' },
  evidence: { source: 'shell-host-probe', observedAt: earlier, expiresAt: later }, repairIntent: null,
});
const decision = () => ({
  contract: 'com.containedevolution.shell.permission-decision/1', contractVersion: 1,
  decisionId: 'decision-a', grantId: 'grant-a', subject: { deviceId: 'phone-a', remoteSessionId: 'remote-session-a' },
  target: { ...target }, capability: { ...contractCapability }, effect: 'read', outcome: 'allow',
  confirmationId: null,
  authentication: { ...decisionAuthentication }, decidedAt: earlier, expiresAt: later, revokedAt: null,
});
const receipt = (outcome = 'succeeded') => ({
  contract: 'com.containedevolution.shell.authenticated-receipt/1', contractVersion: 1,
  receiptId: 'receipt-a', requestId: 'request-a', correlationId: 'correlation-a', idempotencyKey: 'idem-a',
  grantId: 'grant-a', decisionId: 'decision-a', subject: { deviceId: 'phone-a', remoteSessionId: 'remote-session-a' },
  target: { ...target }, capability: { ...contractCapability }, effect: 'read', outcome,
  resultDigest: outcome === 'uncertain' ? null : hash, authentication: { ...receiptAuthentication }, completedAt: now,
});

async function policy() {
  return import('../contracts/v1/remote-trust.mjs');
}

test('published v1 schemas are strict, versioned, target-bound records', () => {
  for (const name of ['remote-session.schema.json', 'live-capability.schema.json', 'permission-decision.schema.json', 'authenticated-receipt.schema.json']) {
    const schema = readSchema(name);
    assert.equal(schema.additionalProperties, false, name);
    assert.equal(schema.properties.contractVersion.const, 1, name);
    assert.match(schema.properties.contract.const, /^com\.containedevolution\.shell\./, name);
  }
  assert.equal(readSchema('remote-session.schema.json').$defs.target.properties.kind.const, 'remote-host');
  assert.deepEqual(readSchema('permission-decision.schema.json').properties.outcome.enum, ['allow', 'deny', 'revoked']);
  assert.ok(readSchema('authenticated-receipt.schema.json').properties.outcome.enum.includes('uncertain'));
});

test('a fresh exact session, observation, and explicit decision authorize', async () => {
  const { evaluateRemoteInvocation } = await policy();
  assert.deepEqual(evaluateRemoteInvocation({ now, invocation: invocation(), session: session(), observation: observation(), decision: decision(), verifyAuthentication }),
    { allowed: true, reason: 'authorized', decisionId: 'decision-a' });
});

test('expiry, disconnect, and revocation fail closed', async () => {
  const { evaluateRemoteInvocation } = await policy();
  const run = overrides => evaluateRemoteInvocation({ now, invocation: invocation(), session: session(), observation: observation(), decision: decision(), verifyAuthentication, ...overrides });
  const expiredSession = session(); expiredSession.expiresAt = now;
  assert.equal(run({ session: expiredSession }).reason, 'session-expired');
  const disconnected = session(); disconnected.state = 'disconnected';
  assert.equal(run({ session: disconnected }).reason, 'session-disconnected');
  const revokedSession = session(); revokedSession.revokedAt = earlier;
  assert.equal(run({ session: revokedSession }).reason, 'session-revoked');
  const expiredEvidence = observation(); expiredEvidence.evidence.expiresAt = now;
  assert.equal(run({ observation: expiredEvidence }).reason, 'capability-stale');
  const revokedDecision = decision(); revokedDecision.outcome = 'revoked'; revokedDecision.revokedAt = earlier;
  assert.equal(run({ decision: revokedDecision }).reason, 'permission-revoked');
});

test('host or host-session replacement invalidates every prior authority record', async () => {
  const { evaluateRemoteInvocation } = await policy();
  const changedHost = invocation(); changedHost.target.id = 'host-b';
  assert.equal(evaluateRemoteInvocation({ now, invocation: changedHost, session: session(), observation: observation(), decision: decision(), verifyAuthentication }).reason, 'session-target-mismatch');
  const changedRuntime = invocation(); changedRuntime.target.sessionId = 'host-session-b';
  assert.equal(evaluateRemoteInvocation({ now, invocation: changedRuntime, session: session(), observation: observation(), decision: decision(), verifyAuthentication }).reason, 'session-target-mismatch');
  const reconnected = session(); reconnected.sessionId = 'remote-session-b';
  assert.equal(evaluateRemoteInvocation({ now, invocation: invocation(), session: reconnected, observation: observation(), decision: decision(), verifyAuthentication }).reason, 'permission-subject-mismatch');
});

test('destructive effects require a decision bound to the same confirmation', async () => {
  const { evaluateRemoteInvocation } = await policy();
  const destructive = invocation(); destructive.effect = 'destructive'; destructive.confirmationId = 'confirmation-a';
  const destructiveDecision = decision(); destructiveDecision.effect = 'destructive'; destructiveDecision.confirmationId = 'confirmation-a';
  assert.equal(evaluateRemoteInvocation({ now, invocation: destructive, session: session(), observation: observation(), decision: destructiveDecision, verifyAuthentication }).allowed, true);
  destructive.confirmationId = null;
  assert.equal(evaluateRemoteInvocation({ now, invocation: destructive, session: session(), observation: observation(), decision: destructiveDecision, verifyAuthentication }).reason, 'permission-confirmation-mismatch');
});

test('phone identity supplies no ambient trust or transferable grant', async () => {
  const { evaluateRemoteInvocation } = await policy();
  const noVerifier = evaluateRemoteInvocation({ now, invocation: invocation(), session: session(), observation: observation(), decision: decision() });
  assert.equal(noVerifier.reason, 'authentication-verifier-missing');
  const otherPhone = decision(); otherPhone.subject.deviceId = 'phone-b';
  assert.equal(evaluateRemoteInvocation({ now, invocation: invocation(), session: session(), observation: observation(), decision: otherPhone, verifyAuthentication }).reason, 'permission-subject-mismatch');
  const noGrant = decision(); noGrant.outcome = 'deny';
  assert.equal(evaluateRemoteInvocation({ now, invocation: invocation(), session: session(), observation: observation(), decision: noGrant, verifyAuthentication }).reason, 'permission-deny');
});

test('unknown, unusable, or unauthenticated capability evidence denies execution', async () => {
  const { evaluateRemoteInvocation } = await policy();
  for (const [field, value, reason] of [
    ['state', 'unknown', 'capability-unknown'],
    ['usable', 'unknown', 'capability-usable-unknown'],
    ['authenticated', 'no', 'capability-authenticated-no'],
  ]) {
    const observed = observation();
    if (field === 'state') observed.state = value; else observed.checks[field] = value;
    assert.equal(evaluateRemoteInvocation({ now, invocation: invocation(), session: session(), observation: observed, decision: decision(), verifyAuthentication }).reason, reason);
  }
});

test('verified idempotent receipts replay; collisions reject; uncertain outcomes reconcile', async () => {
  const { resolveIdempotency } = await policy();
  assert.equal(resolveIdempotency({ invocation: invocation(), session: session(), receipts: [], verifyAuthentication }).action, 'dispatch');
  assert.equal(resolveIdempotency({ invocation: invocation(), session: session(), receipts: [receipt()], verifyAuthentication }).action, 'replay');
  const collision = receipt(); collision.requestId = 'other-request';
  assert.deepEqual(resolveIdempotency({ invocation: invocation(), session: session(), receipts: [collision], verifyAuthentication }), { action: 'reject', reason: 'idempotency-collision' });
  assert.equal(resolveIdempotency({ invocation: invocation(), session: session(), receipts: [receipt('uncertain')], verifyAuthentication }).action, 'reconcile');
  assert.equal(resolveIdempotency({ invocation: invocation(), session: session(), receipts: [receipt()], verifyAuthentication: () => false }).reason, 'receipt-authentication-invalid');
});
