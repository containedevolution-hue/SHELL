'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createPairingStore, CREDENTIAL_VERSION } = require('./pairing');

function fixture(options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'shell-pairing-v3-'));
  const pairingFile = path.join(dir,'pairing.json');
  const outboundFile = path.join(dir,'pairing.outbound.json');
  let now = 1_000;
  const store = createPairingStore({ pairingFile, outboundFile, clock:()=>now, credentialTtlMs:100, ...options });
  return { dir, pairingFile, outboundFile, store, setNow:value=>{now=value;} };
}

test('v2 migrates without invalidating existing clients and removes inbound plaintext', () => {
  const f = fixture();
  const legacy = { credential_version:2, pairing_token:'a'.repeat(64), sync_token:'b'.repeat(64), mcp_token:'c'.repeat(64), user_id:'user-a' };
  fs.writeFileSync(f.pairingFile,JSON.stringify(legacy));
  assert.equal(f.store.matchesToken('identity',legacy.pairing_token),true);
  assert.equal(f.store.matchesToken('sync',legacy.sync_token),true);
  assert.equal(f.store.matchesToken('mcp',legacy.mcp_token),true);
  const persisted = fs.readFileSync(f.pairingFile,'utf8');
  const outbound = fs.readFileSync(f.outboundFile,'utf8');
  assert.equal(JSON.parse(persisted).credential_version,CREDENTIAL_VERSION);
  assert.ok(!persisted.includes(legacy.sync_token) && !persisted.includes(legacy.mcp_token));
  assert.ok(!outbound.includes(legacy.sync_token) && !outbound.includes(legacy.mcp_token));
  assert.equal(f.store.status().reconciliation,'migrated-v2');
});

test('wrong and expired credentials fail closed without leaking through status', () => {
  const f = fixture();
  const token = f.store.getMcpToken();
  assert.equal(f.store.matchesToken('mcp','wrong'),false);
  assert.equal(f.store.matchesToken('mcp',token),true);
  f.setNow(1_100);
  assert.equal(f.store.matchesToken('mcp',token),false);
  assert.equal(f.store.getMcpToken(),null);
  const status = f.store.status();
  assert.equal(status.credentials.mcp.status,'expired');
  assert.ok(!JSON.stringify(status).includes(token));
});

test('rotation and unpair invalidate every credential generation', () => {
  const f = fixture();
  f.store.setUserId('user-a');
  const old = { identity:f.store.getToken(), sync:f.store.getSyncToken(), mcp:f.store.getMcpToken() };
  const rotated = f.store.rotate();
  for (const [scope, token] of Object.entries(old)) assert.equal(f.store.matchesToken(scope,token),false,scope);
  assert.equal(f.store.matchesToken('identity',rotated.credentials.pairing_token),true);
  assert.equal(f.store.matchesToken('sync',rotated.credentials.sync_token),true);
  assert.equal(f.store.matchesToken('mcp',rotated.credentials.mcp_token),true);
  f.store.unpair();
  assert.equal(f.store.isPaired(),false);
  assert.equal(f.store.matchesToken('identity',rotated.credentials.pairing_token),false);
  assert.equal(f.store.matchesToken('sync',rotated.credentials.sync_token),false);
  assert.equal(f.store.matchesToken('mcp',rotated.credentials.mcp_token),false);
});

test('an interrupted two-file rotation keeps old in-memory authority and reconciles from backup after restart', () => {
  const f = fixture();
  const old = f.store.getMcpToken();
  let failStateRename = true;
  const interruptedFs = new Proxy(fs,{ get(target,property) {
    if (property === 'renameSync') return (source,destination) => {
      if (failStateRename && destination === f.pairingFile) { failStateRename=false; const error=new Error('simulated interruption'); error.code='EIO'; throw error; }
      return target.renameSync(source,destination);
    };
    return target[property];
  }});
  const interrupted = createPairingStore({ pairingFile:f.pairingFile, outboundFile:f.outboundFile, clock:()=>1_000, credentialTtlMs:100, fsImpl:interruptedFs });
  assert.equal(interrupted.matchesToken('mcp',old),true);
  assert.throws(()=>interrupted.rotate(),/simulated interruption/);
  assert.equal(interrupted.matchesToken('mcp',old),true);
  const restarted = createPairingStore({ pairingFile:f.pairingFile, outboundFile:f.outboundFile, clock:()=>1_000, credentialTtlMs:100 });
  assert.equal(restarted.matchesToken('mcp',old),true);
  assert.equal(restarted.status().reconciliation,'recovered-backup');
});

test('irreconcilable state reports unavailable and never fabricates authority', () => {
  const f = fixture();
  f.store.getToken();
  fs.writeFileSync(f.pairingFile,'{broken');
  fs.writeFileSync(`${f.pairingFile}.bak`,'{broken');
  fs.writeFileSync(f.outboundFile,'{broken');
  fs.writeFileSync(`${f.outboundFile}.bak`,'{broken');
  const broken = createPairingStore({ pairingFile:f.pairingFile, outboundFile:f.outboundFile, clock:()=>1_000, credentialTtlMs:100 });
  assert.equal(broken.matchesToken('mcp','anything'),false);
  assert.equal(broken.status().reconciliation,'reconciliation-required');
  assert.equal(broken.unpair().paired,false);
  assert.equal(broken.status().reconciliation,'clean');
  assert.equal(broken.matchesToken('mcp','anything'),false);
});
