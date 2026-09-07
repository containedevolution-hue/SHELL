'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createLocalSessionAuthority } = require('./local-auth');

const bootstrap = 'z'.repeat(64);
let tick;
let serial;
function authority() {
  tick = 1_000;
  serial = 0;
  return createLocalSessionAuthority({
    bootstrapToken: bootstrap,
    now: () => tick,
    ttlMs: 100,
    randomBytes: size => Buffer.alloc(size, ++serial),
  });
}

async function host(auth) {
  const app = express();
  app.use('/v1/local-auth', auth.router());
  app.post('/mutate', auth.guard('access.mutate'), (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) };
}

async function exchange(base, callerId = 'main', scopes = ['access.mutate'], secret = bootstrap) {
  return fetch(base + '/v1/local-auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shell-Bootstrap': secret, 'X-Shell-Caller': callerId },
    body: JSON.stringify({ scopes }),
  });
}

function headers(token, callerId = 'main', nonce = 'request-a') {
  return { Authorization: `Bearer ${token}`, 'X-Shell-Caller': callerId, 'X-Shell-Request-Id': nonce };
}

test('unauthenticated loopback and a wrong bootstrap cannot mint or mutate', async t => {
  const auth = authority(); const server = await host(auth); t.after(server.close);
  assert.equal((await fetch(server.base + '/mutate', { method: 'POST' })).status, 401);
  assert.equal((await exchange(server.base, 'main', ['access.mutate'], 'wrong'.repeat(16))).status, 401);
  assert.equal((await exchange(server.base, 'unknown-surface')).status, 403);
});

test('an exact caller and scope can mutate once per request identity', async t => {
  const auth = authority(); const server = await host(auth); t.after(server.close);
  const issued = await (await exchange(server.base)).json();
  assert.deepEqual(issued.scopes, ['access.mutate']);
  assert.equal((await fetch(server.base + '/mutate', { method: 'POST', headers: headers(issued.token) })).status, 200);
  assert.equal((await fetch(server.base + '/mutate', { method: 'POST', headers: headers(issued.token) })).status, 409);
  assert.equal((await fetch(server.base + '/mutate', { method: 'POST', headers: headers(issued.token, 'flow-hud', 'request-b') })).status, 403);
});

test('wrong, expired, revoked, and over-scoped local tokens fail closed', async t => {
  const auth = authority(); const server = await host(auth); t.after(server.close);
  const issued = await (await exchange(server.base)).json();
  assert.equal((await fetch(server.base + '/mutate', { method: 'POST', headers: headers('f'.repeat(64)) })).status, 401);
  tick = issued.expiresAt;
  assert.equal((await fetch(server.base + '/mutate', { method: 'POST', headers: headers(issued.token, 'main', 'expired') })).status, 401);
  tick = 1_000;
  const active = await (await exchange(server.base)).json();
  assert.equal((await fetch(server.base + `/v1/local-auth/session/${active.sessionId}`, { method: 'DELETE', headers: { 'X-Shell-Bootstrap': bootstrap } })).status, 204);
  assert.equal((await fetch(server.base + '/mutate', { method: 'POST', headers: headers(active.token, 'main', 'revoked') })).status, 401);
  assert.equal((await exchange(server.base, 'flow-hud', ['access.mutate'])).status, 403);
});

