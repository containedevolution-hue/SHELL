const SAME = Object.freeze({
  target: (left, right) => left?.kind === right?.kind && left?.id === right?.id && left?.sessionId === right?.sessionId,
  capability: (left, right) => left?.id === right?.id && left?.version === right?.version && left?.inputSchemaHash === right?.inputSchemaHash,
});

function validTime(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function deny(reason) {
  return Object.freeze({ allowed: false, reason });
}

/**
 * Fail-closed reference policy for an Apps tool invocation targeting Shell.
 * Authentication verification is deliberately supplied by the Shell host; a
 * serialized `verified: true` flag would allow an untrusted caller to bless
 * its own session or grant.
 */
export function evaluateRemoteInvocation({
  now,
  invocation,
  session,
  observation,
  decision,
  verifyAuthentication,
}) {
  const at = validTime(now);
  if (at === null) return deny('invalid-now');
  if (typeof verifyAuthentication !== 'function') return deny('authentication-verifier-missing');

  if (session?.contract !== 'com.containedevolution.shell.remote-session/1' || session?.contractVersion !== 1) return deny('session-contract-invalid');
  if (session.state !== 'active') return deny(`session-${session.state || 'unknown'}`);
  if (session.revokedAt) return deny('session-revoked');
  const authenticatedAt = validTime(session.authenticatedAt);
  const sessionExpiry = validTime(session.expiresAt);
  if (authenticatedAt === null || sessionExpiry === null || authenticatedAt > at || sessionExpiry <= authenticatedAt || at >= sessionExpiry) return deny('session-expired');
  if (!verifyAuthentication('remote-session', session)) return deny('session-authentication-invalid');
  if (!SAME.target(invocation?.target, session.target)) return deny('session-target-mismatch');

  if (invocation?.contractVersion !== 1 || invocation?.target?.kind !== 'remote-host') return deny('invocation-contract-invalid');
  if (invocation.capability?.owner !== 'shell') return deny('capability-owner-mismatch');
  if (observation?.contract !== 'com.containedevolution.shell.live-capability/1' || observation?.contractVersion !== 1) return deny('capability-contract-invalid');
  if (observation.owner !== 'shell') return deny('capability-owner-mismatch');
  if (!SAME.target(invocation.target, observation.target)) return deny('capability-target-mismatch');
  if (!SAME.capability(invocation.capability, observation.capability)) return deny('capability-identity-mismatch');
  if (observation.state !== 'available') return deny(`capability-${observation.state || 'unknown'}`);
  const observedAt = validTime(observation.evidence?.observedAt);
  const observationExpiry = validTime(observation.evidence?.expiresAt);
  if (observedAt === null || observationExpiry === null || observedAt > at || observationExpiry <= observedAt || at >= observationExpiry) return deny('capability-stale');
  for (const check of ['installed', 'authenticated', 'reachable', 'granted', 'usable']) {
    if (observation.checks?.[check] !== 'yes') return deny(`capability-${check}-${observation.checks?.[check] || 'unknown'}`);
  }

  if (decision?.contract !== 'com.containedevolution.shell.permission-decision/1' || decision?.contractVersion !== 1) return deny('permission-contract-invalid');
  if (decision.outcome !== 'allow') return deny(`permission-${decision.outcome || 'unknown'}`);
  if (decision.revokedAt) return deny('permission-revoked');
  const decidedAt = validTime(decision.decidedAt);
  const decisionExpiry = validTime(decision.expiresAt);
  if (decidedAt === null || decisionExpiry === null || decidedAt > at || decisionExpiry <= decidedAt || at >= decisionExpiry) return deny('permission-expired');
  if (!verifyAuthentication('permission-decision', decision)) return deny('permission-authentication-invalid');
  if (decision.subject?.deviceId !== session.subject?.deviceId || decision.subject?.remoteSessionId !== session.sessionId) return deny('permission-subject-mismatch');
  if (!SAME.target(invocation.target, decision.target)) return deny('permission-target-mismatch');
  if (!SAME.capability(invocation.capability, decision.capability)) return deny('permission-capability-mismatch');
  if (invocation.grantId !== decision.grantId) return deny('permission-grant-mismatch');
  if (invocation.effect !== decision.effect) return deny('permission-effect-mismatch');
  if (invocation.effect === 'destructive' && (!invocation.confirmationId || invocation.confirmationId !== decision.confirmationId)) return deny('permission-confirmation-mismatch');

  return Object.freeze({ allowed: true, reason: 'authorized', decisionId: decision.decisionId });
}

function receiptMatches(receipt, invocation, session) {
  return receipt.requestId === invocation.requestId
    && receipt.correlationId === invocation.correlationId
    && receipt.grantId === invocation.grantId
    && receipt.effect === invocation.effect
    && receipt.subject?.deviceId === session.subject?.deviceId
    && receipt.subject?.remoteSessionId === session.sessionId
    && SAME.target(receipt.target, invocation.target)
    && SAME.capability(receipt.capability, invocation.capability);
}

/**
 * Decide whether an idempotent request may dispatch, must replay a verified
 * receipt, or must stop for reconciliation. It never turns an uncertain host
 * result into permission to retry a mutation.
 */
export function resolveIdempotency({ invocation, session, receipts = [], verifyAuthentication }) {
  if (typeof verifyAuthentication !== 'function') return Object.freeze({ action: 'reject', reason: 'authentication-verifier-missing' });
  const found = receipts.filter(receipt => receipt?.idempotencyKey === invocation?.idempotencyKey);
  if (found.length === 0) return Object.freeze({ action: 'dispatch', reason: 'unused-idempotency-key' });
  if (found.length !== 1 || !receiptMatches(found[0], invocation, session)) return Object.freeze({ action: 'reject', reason: 'idempotency-collision' });
  const receipt = found[0];
  if (receipt.contract !== 'com.containedevolution.shell.authenticated-receipt/1' || receipt.contractVersion !== 1) return Object.freeze({ action: 'reject', reason: 'receipt-contract-invalid' });
  if (!verifyAuthentication('authenticated-receipt', receipt)) return Object.freeze({ action: 'reject', reason: 'receipt-authentication-invalid' });
  if (receipt.outcome === 'uncertain') return Object.freeze({ action: 'reconcile', reason: 'previous-outcome-uncertain', receipt });
  return Object.freeze({ action: 'replay', reason: 'verified-receipt', receipt });
}
