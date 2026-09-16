'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { normalizePublicTunnelUrl, namedTunnelUrl } = require('./tunnel-detect');

test('public tunnel URLs reject stale machine hostnames', () => {
  assert.equal(normalizePublicTunnelUrl('https://cehub'), null);
  assert.equal(normalizePublicTunnelUrl('hub.tenari.world'), 'https://hub.tenari.world');
  assert.equal(normalizePublicTunnelUrl('https://abc.trycloudflare.com/path'), 'https://abc.trycloudflare.com');
});

test('named tunnel URL is recovered from cloudflared config', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cehub-tunnel-'));
  const configPath = path.join(directory, 'config.yml');
  fs.writeFileSync(configPath, [
    'tunnel: appliance-id',
    'ingress:',
    '  - hostname: hub.tenari.world',
    '    service: http://127.0.0.1:5984',
  ].join('\n'));
  try {
    assert.equal(namedTunnelUrl(configPath), 'https://hub.tenari.world');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
