'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createScopedTokenGuard } = require('./scoped-auth');
const { createLocalSessionAuthority } = require('./local-auth');

const pairing = {
  matchesToken(scope, candidate) { return scope === 'mcp' ? candidate === 'mcp-secret' : candidate === 'sync-secret'; },
};

async function serve(guard) {
  const app = express();
  app.post('/action', guard, (_req, res) => res.json({ ok:true }));
  const server = app.listen(0,'127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  return { url:`http://127.0.0.1:${server.address().port}/action`, close:()=>new Promise(resolve=>server.close(resolve)) };
}

test('loopback is transport location, never scoped authentication', async t => {
  const host = await serve(createScopedTokenGuard(pairing,'mcp')); t.after(host.close);
  assert.equal((await fetch(host.url,{method:'POST'})).status,401);
  assert.equal((await fetch(host.url,{method:'POST',headers:{Authorization:'Bearer wrong'}})).status,401);
  assert.equal((await fetch(host.url,{method:'POST',headers:{Authorization:'Bearer mcp-secret'}})).status,200);
});

test('the exact Flow HUD may use a fresh local sync session with non-replayed requests', async t => {
  const localAuthority = createLocalSessionAuthority({bootstrapToken:'s'.repeat(64)});
  const host = await serve(createScopedTokenGuard(pairing,'sync',{localAuthority,localScope:'sync.invoke'})); t.after(host.close);
  const local = localAuthority.issue('flow-hud',['sync.invoke']);
  const headers = {Authorization:`Bearer ${local.token}`,'X-Shell-Caller':'flow-hud','X-Shell-Request-Id':'flow-a'};
  assert.equal((await fetch(host.url,{method:'POST',headers})).status,200);
  assert.equal((await fetch(host.url,{method:'POST',headers})).status,409);
  assert.equal((await fetch(host.url,{method:'POST',headers:{...headers,'X-Shell-Caller':'main','X-Shell-Request-Id':'flow-b'}})).status,403);
});

