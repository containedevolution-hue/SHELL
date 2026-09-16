'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const foundation = fs.readFileSync(
  path.join(__dirname, '..', 'docs', 'security-and-health-foundation.md'),
  'utf8'
);
const eventSchema = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'contracts', 'v1', 'health-event.schema.json'),
  'utf8'
));

test('security remains local-first and independent of Tenari', () => {
  assert.match(foundation, /work offline, without an\s+account/i);
  assert.match(foundation, /Tenari may explain[\s\S]*granted capability/i);
  assert.match(foundation, /never receives\s+ambient access/i);
});

test('VPN-first policy is provider-neutral, optional, and recoverable', () => {
  assert.match(foundation, /provider-neutral profile importer/i);
  assert.match(foundation, /VPN use is optional/i);
  assert.match(foundation, /Recovery:.*time-limited local action/is);
  assert.match(foundation, /Secrets use the system secret service/i);
});

test('Arch updates remain complete, snapshot-backed transactions', () => {
  assert.match(foundation, /partial upgrades are unsupported/i);
  assert.match(foundation, /creates a Btrfs snapshot/i);
  assert.match(foundation, /one complete signed package transaction/i);
  assert.match(foundation, /Unattended installation\s+is opt-in/i);
});

test('early anomaly handling warns with evidence instead of acting autonomously', () => {
  assert.match(foundation, /No first release automatically kills a process/i);
  assert.match(foundation, /Alerts require both a meaningful deviation\s+and supporting evidence/i);
  assert.match(foundation, /not “malicious.”/i);
});

test('health event v1 carries source, evidence, baseline state, and approval semantics', () => {
  assert.equal(eventSchema.properties.contract.const, 'com.containedevolution.shell.health-event/1');
  assert.ok(eventSchema.required.includes('source'));
  assert.ok(eventSchema.required.includes('evidence'));
  assert.ok(eventSchema.properties.measurement.properties.baselineStatus.enum.includes('unusual'));
  assert.ok(eventSchema.properties.measurement.properties.baselineStatus.enum.includes('unavailable'));
  assert.ok(eventSchema.properties.proposedAction.required.includes('requiresApproval'));
  assert.ok(eventSchema.properties.proposedAction.required.includes('reversible'));
  assert.equal(eventSchema.additionalProperties, false);
});
