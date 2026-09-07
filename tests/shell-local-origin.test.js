'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'web', 'apps.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8');

test('native Shell pins API calls to its process-owned sidecar rather than an arbitrary loopback page', () => {
  assert.match(script, /const origin = invoke \? 'http:\/\/127\.0\.0\.1:5984'/);
  assert.doesNotMatch(script, /const origin = location\.protocol/);
  assert.match(script, /application\\\/json/);
});

test('startup races recover automatically and leave a manual retry control', () => {
  assert.match(script, /refreshAll\(\{startup:true\}\)/);
  assert.match(script, /const attempts = startup \? 8 : 1/);
  assert.match(script, /retry-local/);
  assert.match(page, /id="retry-local" hidden>Retry local services/);
});
