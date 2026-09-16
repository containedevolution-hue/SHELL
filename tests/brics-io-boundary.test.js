const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const boundary = fs.readFileSync(path.join(__dirname, '..', 'contracts', 'v1', 'BRICS-IO.md'), 'utf8');

test('CEE OS owns and limits privileged Brics I/O routing', () => {
  assert.match(boundary, /sole owner of privileged computer-side input routing/i);
  assert.match(boundary, /reject replayed or out-of-order sequence numbers/i);
  assert.match(boundary, /allowlisted semantic action/i);
  assert.match(boundary, /Imported profiles grant nothing/i);
});

test('the Brics I/O session never transports ambient authority', () => {
  assert.match(boundary, /never a credential, pairing secret, shell command, executable payload, or reusable authorization token/i);
  assert.match(boundary, /remote Brics I\/O adapter is not implemented yet/i);
});
