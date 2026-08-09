'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { normalizePublicTunnelUrl, namedTunnelUrl } = require('./tunnel-detect');

test('public tunnel URLs reject stale machine hostnames', () => {
  assert.equal(normalizePublicTunnelUrl('https://cehub'), null);
  assert.equal(normalizePublicTunnelUrl('cehub-mcp.containedevolution.com'), 'https://cehub-mcp.containedevolution.com');
  assert.equal(normalizePublicTunnelUrl('https://abc.trycloudflare.com/path'), 'https://abc.trycloudflare.com');
});

test('named tunnel URL is recovered from cloudflared config', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cehub-tunnel-'));
  const configPath = path.join(directory, 'config.yml');
  fs.writeFileSync(configPath, [
    'tunnel: appliance-id',
    'ingress:',
    '  - hostname: cehub-mcp.containedevolution.com',
    '    service: http://127.0.0.1:5984',
  ].join('\n'));
  try {
    assert.equal(namedTunnelUrl(configPath), 'https://cehub-mcp.containedevolution.com');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
