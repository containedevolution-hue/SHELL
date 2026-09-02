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

