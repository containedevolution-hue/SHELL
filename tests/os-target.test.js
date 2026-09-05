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
  assert.equal(target.vm.vcpus, 2);
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
  assert.match(launcher, /\[string\]\$Accelerator = 'Whpx'/);
  assert.match(launcher, /q35,accel=tcg/);
  assert.match(launcher, /q35,accel=whpx,kernel-irqchip=off/);
  assert.match(launcher, /if \(\$Accelerator -eq 'Whpx'\) \{ 'qemu64' \}/);
  assert.match(launcher, /'-vga', 'std'/);
  assert.match(launcher, /gtk,clipboard=on,grab-on-hover=off,show-cursor=on,zoom-to-fit=on/);
  assert.match(launcher, /qemu-vdagent,id=vdagent,name=vdagent,clipboard=on,mouse=off/);
  assert.match(launcher, /virtserialport,chardev=vdagent,name=com\.redhat\.spice\.0/);
  assert.match(launcher, /'-smp', '2'/);
  assert.match(launcher, /shell-os\.qcow2/);
  assert.match(launcher, /\.artifacts/);
  assert.match(launcher, /Start-Process -FilePath \$qemu/);
  assert.match(launcher, /This PowerShell window may now be closed/);
  assert.doesNotMatch(launcher, /(?:Clear-Disk|Format-Volume|Remove-Partition|diskpart)/i);
});

test('guest inventory is read-only and reports unavailable dependencies', () => {
  const inventory = fs.readFileSync(path.join(root, 'os', 'guest', 'bin', 'shell-health-inventory'), 'utf8');
  assert.match(inventory, /com\.containedevolution\.shell\.health-event\/1/);
  assert.match(inventory, /\/proc\/meminfo/);
  assert.match(inventory, /nmcli/);
  assert.match(inventory, /checkupdates/);
  assert.match(inventory, /nft list ruleset/);
  assert.match(inventory, /systemctl is-enabled "\$firewall_unit"/);
  assert.match(inventory, /systemctl is-active "\$firewall_unit"/);
  assert.match(inventory, /unavailable/);
  assert.doesNotMatch(inventory, /(?:sudo|pacman\s+-S|systemctl\s+(?:enable|start|stop)|nft\s+(?:add|delete|flush))/);
});

test('SHELL firewall defaults to outbound access and recovery-safe inbound denial', () => {
  const rules = fs.readFileSync(path.join(root, 'os', 'guest', 'security', 'shell-base.nft'), 'utf8');
  const unit = fs.readFileSync(path.join(root, 'os', 'guest', 'systemd', 'shell-firewall.service'), 'utf8');
  const installer = fs.readFileSync(path.join(root, 'os', 'guest', 'bin', 'install-shell-firewall'), 'utf8');
  assert.match(rules, /chain input[\s\S]*policy drop/);
  assert.match(rules, /ct state established,related accept/);
  assert.match(rules, /iifname "lo" accept/);
  assert.match(rules, /meta l4proto ipv6-icmp accept/);
  assert.match(rules, /chain forward[\s\S]*policy drop/);
  assert.match(rules, /chain output[\s\S]*policy accept/);
  assert.match(unit, /CapabilityBoundingSet=CAP_NET_ADMIN/);
  assert.match(unit, /ProtectSystem=strict/);
  assert.match(unit, /ExecStop=-\/usr\/bin\/nft delete table inet shell_filter/);
  assert.match(installer, /nft -c -f "\$rules_source"/);
  assert.match(installer, /systemctl enable --now shell-firewall\.service/);
  assert.match(installer, /systemctl disable --now shell-firewall\.service/);
  assert.doesNotMatch(installer, /flush ruleset/);
});

test('firewall verifier proves service, policy, DNS, and outbound state without mutation', () => {
  const verifier = fs.readFileSync(path.join(root, 'os', 'guest', 'bin', 'verify-shell-firewall'), 'utf8');
  assert.match(verifier, /systemctl is-enabled --quiet shell-firewall\.service/);
  assert.match(verifier, /systemctl is-active --quiet shell-firewall\.service/);
  assert.match(verifier, /nft list table inet shell_filter/);
  assert.match(verifier, /hook input\.\*policy drop/);
  assert.match(verifier, /hook output\.\*policy accept/);
  assert.match(verifier, /getent ahosts archlinux\.org/);
  assert.match(verifier, /ping -c 1 -W 3 archlinux\.org/);
  assert.doesNotMatch(verifier, /(?:systemctl\s+(?:enable|disable|start|stop|restart)|nft\s+(?:add|delete|flush)|pacman)/);
});

test('VM checkpoints include disk and UEFI state and guard restore', () => {
  const checkpoint = fs.readFileSync(path.join(root, 'os', 'host', 'manage-msi-vm-checkpoint.ps1'), 'utf8');
  assert.match(checkpoint, /Get-Process qemu-system-x86_64/);
  assert.match(checkpoint, /snapshot -c \$Name \$diskPath/);
  assert.match(checkpoint, /Copy-Item -LiteralPath \$varsPath -Destination \$savedVarsPath/);
  assert.match(checkpoint, /snapshot -a \$Name \$diskPath/);
  assert.match(checkpoint, /if \(-not \$ConfirmRestore\)/);
  assert.match(checkpoint, /Copy-Item -LiteralPath \$savedVarsPath -Destination \$varsPath -Force/);
  assert.doesNotMatch(checkpoint, /Remove-Item -LiteralPath \$vmRoot/);
});
