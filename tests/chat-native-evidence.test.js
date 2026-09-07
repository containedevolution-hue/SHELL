'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { capture } = require('../scripts/capture-chat-native-evidence');

test('evidence collector reports Windows and missing sessions unavailable without commands', async () => {
  for (const options of [{ platform: 'win32' }, { platform: 'linux', env: {} }]) {
    const report = await capture({ ...options, execute: () => { throw new Error('must not run'); } });
    assert.equal(report.state, 'unavailable');
    assert.equal(report.productionEligible, false);
    assert.deepEqual(report.windows, []);
  }
});

test('evidence collector records actual returned identities and excludes titles and monitor serials', async () => {
  const calls = [];
  const execute = async (_file, args) => {
    calls.push(args);
    return JSON.stringify(args.includes('version') ? { tag: 'v0.55.1', commit: 'fixture' } : [{ id: 1, name: 'fixture', width: 1920, serial: 'private', description: 'private' }]);
  };
  const report = await capture({ platform: 'linux', env: { HYPRLAND_INSTANCE_SIGNATURE: 'fixture' }, execute,
    backend: { listWindows: async () => [{ windowId: '0x1', processExecutable: '/fixture/app', initialClass: 'ActualReturnedClass', nativeSessionId: 'process-fixture' }] } });
  assert.equal(report.state, 'observed');
  assert.equal(report.windows[0].initialClass, 'ActualReturnedClass');
  assert.equal(report.productionEligible, false);
  assert.equal(report.capabilityComparison, 'not-performed');
  assert.equal(JSON.stringify(report).includes('private'), false);
  assert.deepEqual(calls, [['-j', 'version'], ['-j', 'monitors']]);
});

test('failed evidence capture is incomplete and never qualifies an installation', async () => {
  const report = await capture({ platform: 'linux', env: { HYPRLAND_INSTANCE_SIGNATURE: 'fixture' }, execute: async () => { throw new Error('no permission'); } });
  assert.equal(report.state, 'unavailable');
  assert.equal(report.productionEligible, false);
});
