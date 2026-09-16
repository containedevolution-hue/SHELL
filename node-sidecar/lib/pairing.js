'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { inData } = require('./paths');

const CREDENTIAL_VERSION = 3;
const VERIFY_CODE_TTL_MS = 10 * 60 * 1000;
const CREDENTIAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SCOPES = Object.freeze(['identity', 'sync', 'mcp']);

function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function createPairingStore({ pairingFile = inData('pairing.json'), outboundFile = inData('pairing.outbound.json'), clock = Date.now, randomBytes = crypto.randomBytes, fsImpl = fs, credentialTtlMs = CREDENTIAL_TTL_MS } = {}) {
  const backupFile = `${pairingFile}.bak`;
  const outboundBackupFile = `${outboundFile}.bak`;
  let cache = null;
  let reconciliation = 'clean';
  const secret = (bytes = 32) => randomBytes(bytes).toString('hex');
  const tokenHash = token => crypto.createHash('sha256').update(token).digest('hex');
  const credential = token => ({ hash:tokenHash(token), issued_at:clock(), expires_at:clock() + credentialTtlMs, revoked_at:null });

  function build(raw, { userId = null, generation = 1 } = {}) {
    const now = clock();
    return {
      state:{ credential_version:CREDENTIAL_VERSION, generation, user_id:userId, credentials:Object.fromEntries(SCOPES.map(scope => [scope, credential(raw[scope])])), verify_code:userId ? null : secret(3).toUpperCase(), verify_code_created_at:userId ? null : now, updated_at:now },
      outbound:{ credential_version:CREDENTIAL_VERSION, generation, identity_token:raw.identity },
      raw,
    };
  }

  function decode(state, outbound) {
    if (!state || state.credential_version !== CREDENTIAL_VERSION || !state.credentials) throw new Error('unsupported pairing state');
    for (const scope of SCOPES) if (!/^[0-9a-f]{64}$/.test(state.credentials[scope]?.hash || '')) throw new Error('credential hash invalid');
    if (!outbound || outbound.credential_version !== CREDENTIAL_VERSION || outbound.generation !== state.generation || !safeEqual(tokenHash(outbound.identity_token || ''), state.credentials.identity.hash)) throw new Error('outbound credential mismatch');
    return { state, outbound, raw:{ identity:outbound.identity_token, sync:null, mcp:null } };
  }

  function persist(next, { preserveBackup = true } = {}) {
    fsImpl.mkdirSync(path.dirname(pairingFile), { recursive:true });
    fsImpl.mkdirSync(path.dirname(outboundFile), { recursive:true });
    const suffix = `${process.pid}-${secret(6)}`;
    const stateTmp = `${pairingFile}.tmp-${suffix}`;
    const outboundTmp = `${outboundFile}.tmp-${suffix}`;
    try {
      fsImpl.writeFileSync(stateTmp, JSON.stringify(next.state, null, 2), { flag:'wx', mode:0o600 });
      fsImpl.writeFileSync(outboundTmp, JSON.stringify(next.outbound, null, 2), { flag:'wx', mode:0o600 });
      try { fsImpl.chmodSync(stateTmp, 0o600); fsImpl.chmodSync(outboundTmp, 0o600); } catch (_) {}
      if (preserveBackup && fsImpl.existsSync(pairingFile) && fsImpl.existsSync(outboundFile)) {
        try {
          const currentState = JSON.parse(fsImpl.readFileSync(pairingFile, 'utf8'));
          const currentOutbound = JSON.parse(fsImpl.readFileSync(outboundFile, 'utf8'));
          decode(currentState, currentOutbound);
          fsImpl.copyFileSync(pairingFile, backupFile);
          fsImpl.copyFileSync(outboundFile, outboundBackupFile);
        } catch (_) {}
      }
      fsImpl.renameSync(outboundTmp, outboundFile);
      fsImpl.renameSync(stateTmp, pairingFile);
      try {
        fsImpl.copyFileSync(pairingFile, backupFile);
        fsImpl.copyFileSync(outboundFile, outboundBackupFile);
        fsImpl.chmodSync(pairingFile, 0o600); fsImpl.chmodSync(outboundFile, 0o600);
        fsImpl.chmodSync(backupFile, 0o600); fsImpl.chmodSync(outboundBackupFile, 0o600);
      } catch (_) {}
    } catch (error) {
      try { fsImpl.unlinkSync(stateTmp); } catch (_) {}
      try { fsImpl.unlinkSync(outboundTmp); } catch (_) {}
      throw error;
    }
  }

  function migrateV2(legacy) {
    const next = build({ identity:legacy.pairing_token || secret(), sync:legacy.sync_token || secret(), mcp:legacy.mcp_token || secret() }, { userId:legacy.user_id || null, generation:1 });
    persist(next, { preserveBackup:false });
    reconciliation = 'migrated-v2';
    return next;
  }

  function readJson(file) { return JSON.parse(fsImpl.readFileSync(file, 'utf8')); }

  function load() {
    if (cache) return cache;
    let primary = null;
    try { primary = readJson(pairingFile); } catch (_) {}
    if (primary?.credential_version === 2 || (primary && 'pairing_token' in primary)) return (cache = migrateV2(primary));
    if (primary) {
      try { return (cache = decode(primary, readJson(outboundFile))); } catch (_) {}
    }
    try {
      const recovered = decode(readJson(backupFile), readJson(outboundBackupFile));
      persist(recovered, { preserveBackup:false });
      reconciliation = 'recovered-backup';
      return (cache = recovered);
    } catch (_) {}
    if (primary || fsImpl.existsSync(pairingFile) || fsImpl.existsSync(outboundFile)) {
      reconciliation = 'reconciliation-required';
      throw new Error('pairing credentials cannot be reconciled; unpair locally');
    }
    const next = build({ identity:secret(), sync:secret(), mcp:secret() });
    persist(next, { preserveBackup:false });
    return (cache = next);
  }

  function statusFor(record) {
    if (record.revoked_at !== null) return 'revoked';
    if (!Number.isFinite(record.expires_at) || clock() >= record.expires_at) return 'expired';
    return 'active';
  }

  function status() {
    try {
      const { state, raw } = load();
      return { credentialVersion:CREDENTIAL_VERSION, generation:state.generation, paired:!!state.user_id, reconciliation, outboundProtection:'filesystem-permissions', credentials:Object.fromEntries(SCOPES.map(scope => [scope, { status:statusFor(state.credentials[scope]), expiresAt:state.credentials[scope].expires_at, exportAvailable:typeof raw[scope] === 'string' }])) };
    } catch (_) {
      return { credentialVersion:CREDENTIAL_VERSION, generation:null, paired:false, reconciliation:'reconciliation-required', outboundProtection:'unavailable', credentials:{} };
    }
  }

  function validRaw(scope) {
    const current = load();
    return statusFor(current.state.credentials[scope]) === 'active' ? current.raw[scope] : null;
  }

  function matchesToken(scope, candidate) {
    if (!SCOPES.includes(scope) || typeof candidate !== 'string') return false;
    let current;
    try { current = load(); } catch (_) { return false; }
    const record = current.state.credentials[scope];
    return statusFor(record) === 'active' && safeEqual(tokenHash(candidate), record.hash);
  }

  function replace(next) { persist(next); cache = next; return next; }

  function rotate() {
    const current = load();
    const next = build({ identity:secret(), sync:secret(), mcp:secret() }, { userId:current.state.user_id || null, generation:(current.state.generation || 0) + 1 });
    replace(next); reconciliation = 'clean';
    return { generation:next.state.generation, expiresAt:next.state.credentials.identity.expires_at, credentials:{ pairing_token:next.raw.identity, sync_token:next.raw.sync, mcp_token:next.raw.mcp } };
  }

  function unpair() {
    let generation = 0;
    let recover = false;
    try { generation = load().state.generation || 0; } catch (_) { recover = true; }
    const next = build({ identity:secret(), sync:secret(), mcp:secret() }, { userId:null, generation:generation + 1 });
    if (recover) { persist(next, { preserveBackup:false }); cache = next; }
    else replace(next);
    reconciliation = 'clean';
    return { generation:next.state.generation, paired:false };
  }

  function setUserId(userId) {
    if (typeof userId !== 'string' || !userId) throw new TypeError('user id required');
    let current = load();
    if (!current.raw.sync || !current.raw.mcp) {
      const raw = { identity:current.raw.identity, sync:secret(), mcp:secret() };
      const next = build(raw, { userId:null, generation:(current.state.generation || 0) + 1 });
      current = replace(next);
    }
    replace({ state:{ ...current.state, user_id:userId, verify_code:null, verify_code_created_at:null, updated_at:clock() }, outbound:{ ...current.outbound }, raw:{ ...current.raw } });
  }

  function getVerifyCode() {
    const current = load();
    if (current.state.user_id) return null;
    if (!current.state.verify_code || !Number.isFinite(current.state.verify_code_created_at) || clock() - current.state.verify_code_created_at >= VERIFY_CODE_TTL_MS) {
      const next = { state:{ ...current.state, verify_code:secret(3).toUpperCase(), verify_code_created_at:clock(), updated_at:clock() }, outbound:{ ...current.outbound }, raw:{ ...current.raw } };
      replace(next); return next.state.verify_code;
    }
    return current.state.verify_code;
  }

  return Object.freeze({ CREDENTIAL_VERSION, getToken:()=>validRaw('identity'), getSyncToken:()=>validRaw('sync'), getMcpToken:()=>validRaw('mcp'), getUserId:()=>load().state.user_id || null, isPaired:()=>{ try { return !!load().state.user_id; } catch (_) { return false; } }, setUserId, getVerifyCode, matchesToken, rotate, unpair, status });
}

const singleton = createPairingStore();
module.exports = { CREDENTIAL_VERSION, VERIFY_CODE_TTL_MS, CREDENTIAL_TTL_MS, createPairingStore, ...singleton };
