'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const target = JSON.parse(fs.readFileSync(path.join(root, 'os', 'targets', 'msi-gf63-11uc.json'), 'utf8'));

test('MSI VM profile is bounded and cannot authorize host disk mutation', () => {
  assert.equal(target.schemaVersion, 1);
  assert.equal(target.host.model, 'GF63 Thin 11UC');
  assert.equal(target.host.cpu, 'Intel Core i5-11400H');
  assert.equal(target.host.memoryGiB, 32);
  assert.equal(target.hostDiskMutationAllowed, false);
  assert.deepEqual(target.stages, ['vm', 'live-usb', 'isolated-disk', 'primary-install']);
});

test('guest session exports the v1 contract and fails if SHELL is absent', () => {
  const launcher = fs.readFileSync(path.join(root, 'os', 'guest', 'bin', 'shell-session'), 'utf8');
  assert.match(launcher, /SHELL_CAPABILITY_CONTRACT=com\.containedevolution\.shell\.capabilities\/1/);
  assert.match(launcher, /exit 66/);
  assert.doesNotMatch(launcher, /Tenari/i);
});

test('physical install stays behind the full device proof gate', () => {
  const required = ['boot-and-recovery', 'intel-graphics', 'nvidia-graphics', 'wifi', 'audio', 'suspend-resume', 'secure-boot', 'update-rollback'];
  for (const gate of required) assert.ok(target.physicalProofRequired.includes(gate), gate);
});

test('Windows VM launcher is disposable, accelerated, and repo-contained', () => {
  const launcher = fs.readFileSync(path.join(root, 'os', 'host', 'start-msi-vm.ps1'), 'utf8');
  assert.match(launcher, /q35,accel=whpx:tcg/);
  assert.match(launcher, /'-vga', 'std'/);
  assert.match(launcher, /shell-os\.qcow2/);
  assert.match(launcher, /\.artifacts/);
  assert.match(launcher, /Start-Process -FilePath \$qemu/);
  assert.match(launcher, /This PowerShell window may now be closed/);
  assert.doesNotMatch(launcher, /(?:Clear-Disk|Format-Volume|Remove-Partition|diskpart)/i);
});
