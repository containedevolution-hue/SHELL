'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const prompts = require('../node-sidecar/lib/flow-prompts');

test('Flow prompt ownership is local to SHELL and preserves transformation boundaries', () => {
  assert.match(prompts.cleanupSystem({ context: 'terminal' }), /dictating into: terminal/);
  assert.match(prompts.cleanupSystem(), /Do NOT paraphrase/);
  assert.match(prompts.commandSystem(), /return the rewritten text/);
  assert.match(prompts.commandUser('before', 'uppercase'), /SELECTION:\nbefore[\s\S]*INSTRUCTION:\nuppercase/);
});
