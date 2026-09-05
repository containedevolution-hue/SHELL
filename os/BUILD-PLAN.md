# SHELL OS build plan

This is the ordered replacement plan for turning the Arch/KDE development guest
into SHELL OS. KDE is recovery scaffolding. A component is replaced only when
SHELL needs to own its behavior or language and the replacement has an exercised
recovery path.

## Dependency rule

SHELL owns the experience and policy. It inherits standards and maintained Linux
infrastructure. Dependency count is not the target by itself: every dependency
must either provide a tested boundary we intentionally rely on or be replaced.

Keep initially: Linux, systemd, Wayland, NetworkManager, WireGuard, nftables,
PipeWire, BlueZ, Btrfs, Mesa/vendor drivers, pacman, Flatpak/bubblewrap, and XDG
portals.

Replace progressively: Plasma shell and panels, System Monitor, System Settings,
Discover, Dolphin, notifications, lock screen, SDDM presentation, and first-boot
experience. KWin and SDDM remain replaceable foundations, not permanent product
commitments.

## Gates and order

### O0 — observable core

- Version health events and action receipts.
- Inventory the guest without root or state changes.
- Normalize CPU, memory, storage, networking, services, firewall, VPN, update,
  and recovery state.
- Represent missing or inaccessible facts as unavailable, never healthy or zero.

Exit: a deterministic collector emits evidence-bearing local records and passes
fixtures/tests on every commit.

### O1 — privileged action boundary

- Create a narrowly privileged system service and PolicyKit actions.
- Separate observation, proposal, authorization, execution, and receipt.
- Add a local recovery report usable when the graphical shell is unavailable.

Exit: the desktop cannot execute arbitrary root commands; every mutation has an
approval rule, audit receipt, and documented reversal.

### O2 — network, security, update, and rollback

- Establish nftables baseline and explicit development/LAN/Brics grants.
- Import provider-neutral WireGuard profiles and prove Direct, Prefer, Require,
  and Recovery policies in that order.
- Implement safe Arch update checking, Btrfs pre-update snapshots, full update
  transactions, verification, and rollback.
- Add download/import scanning and package integrity checks.

Exit: deliberately broken network and update verification scenarios recover in
the VM without editing the virtual disk from Windows.

### O3 — SHELL core surfaces inside Plasma

- Build Security & Performance Center over the core contracts.
- Build SHELL Settings, Files, Applications, permissions, and notifications.
- Keep raw evidence, units, service names, and developer details expandable.
- Treat KDE applications as comparison and emergency tools.

Exit: the SHELL surfaces complete their primary workflows while Plasma remains
available underneath for recovery.

### O4 — independent SHELL development session

- Add a distinct `SHELL Development` entry to the login session selector.
- Start KWin/Wayland with the SHELL workspace instead of Plasma shell/panels.
- Provide launcher, workspace, window controls, terminal, network recovery,
  display settings, notifications, lock, logout, and crash fallback.
- Keep `Plasma (Recovery)` as a separate login choice.

Exit: repeated login, logout, crash, reboot, display-change, and offline tests
return to a usable SHELL or recovery session.

### O5 — owned startup experience

- Create the SHELL login and lock presentation.
- Create first boot, owner creation, encryption/recovery-key, network privacy,
  update policy, accessibility, and restore flows.
- Replace SDDM only if its authentication/session boundary limits the desired
  experience; otherwise retain its engine behind a SHELL-owned presentation.

Exit: authentication remains PAM-compatible, secrets never enter the desktop
process, recovery works without networking, and accessibility paths are proven.

### O6 — physical MSI qualification

- Prove the live USB, isolated disk, encryption, Secure Boot/UKI, firmware,
  hybrid graphics, thermals, battery, suspend, audio, camera, Bluetooth, Wi-Fi,
  external displays, removable devices, update rollback, and Windows recovery.
- Remove KDE packages only after SHELL and non-graphical rescue paths cover every
  recovery workflow they provided.

Exit: the MSI evidence gates are complete. Primary-drive installation remains a
separate explicit decision.

## Current start point

O0 is active. `guest/bin/shell-health-inventory` is the first read-only probe.
It is intentionally small: prove facts and their unavailable states before
adding sampling, baselines, storage, privileges, or UI.

First Arch runtime proof on 2026-09-03 established that the installed guest can
execute the checked-in probe and read kernel, uptime, CPU load, memory, root
storage, NetworkManager, and active VPN state. NetworkManager reported connected
and no private connection was active. `checkupdates` reported unavailable because
`pacman-contrib` was not installed. nftables tooling existed, while complete rule
inspection correctly reported that the unprivileged process lacked access. This
proves probe execution and unavailable-state behavior, not firewall enforcement,
update safety, VPN routing, continuous collection, or physical MSI behavior.

The first complete `pacman -Syu` transaction and installation of
`pacman-contrib` subsequently completed. The guest encountered one WHPX pause
during the requested reboot (`Unexpected VP exit code 4`), then booted normally
after QEMU was closed and relaunched. The post-update inventory proved a fresh
boot, connected NetworkManager state, a working `checkupdates` result with zero
pending packages, and the expected disabled/inactive firewall. This proves the
package update and post-update guest boot; accelerated in-place reboot remains a
known launcher defect to reproduce and resolve.

The first live SHELL firewall activation then proved the service active and
enabled, the `inet shell_filter` table readable with elevation, input and forward
default-drop policies, output default-accept, required recovery traffic rules,
working DNS, and three successful outbound probes with zero packet loss. Startup
persistence remains unproved until the next guest boot.

## Resume here

The VM was stopped and an offline `firewall-live-verified` checkpoint was created
on 2026-09-05. It includes both the qcow2 disk snapshot and saved UEFI variable
state. The earlier `pre-security-baseline` checkpoint also remains available.

The next session must prove firewall startup persistence before adding another
security control:

1. Start the stopped guest with `start-msi-vm.ps1 -Mode Disk`.
2. In `~/SHELL`, run `git pull --ff-only`.
3. Run `sudo ./os/guest/bin/verify-shell-firewall`.
4. Record whether all five checks pass after boot: enabled, active, policy,
   DNS, and outbound networking.

If WHPX pauses with `Unexpected VP exit code 4`, close and relaunch QEMU, record
the recurrence, and continue the same firewall verification. Do not restore a
checkpoint unless the guest or network actually fails. Clipboard paste has also
occasionally exposed the bracketed-paste prefix `^[[200~`; type short diagnostic
commands manually when that occurs. Neither defect is evidence about firewall
state.

After startup persistence passes, the next O1 build is the narrow privileged
action broker and receipt contract. Do not add VPN-required policy, automatic
blocking, or further firewall grants before that authorization boundary exists.
