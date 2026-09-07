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
- Qualify Hyprland/Wayland as the first Chat native-desk compositor candidate;
  start the SHELL workspace only after its independent-session gates pass.
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

The active Chat Slice 3 continuation is the separate
[Hyprland test session](CHAT-HYPRLAND-TEST.md), with KDE retained as recovery.
The registry, controller, adapter, authenticated in-process bridge, and trusted
geometry validator are implemented and default-off. Tauri IPC/launcher wiring,
the live native geometry producer and lifecycle callbacks, and installed-provider
capability comparison remain pending. No Linux machine was connected during
the Windows implementation pass; the read-only identity collector correctly
reported unavailable. This work does not close O1/O2, native packaging, or O4.

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
working DNS, and three successful outbound probes with zero packet loss.

Startup persistence passed on 2026-09-06 after the stopped guest was launched in
Disk mode. The guest fast-forwarded SHELL to `83a49416`; the user then ran
`sudo ./os/guest/bin/verify-shell-firewall`. The supplied screenshot
`Screenshot 2026-09-06 141643.png` shows all five checks passing: enabled for
startup, service active, rule policies and recovery traffic verified, DNS
resolution, and outbound networking. This closes the VM firewall startup gate;
it does not prove physical hardware behavior or the separate WHPX in-place
reboot defect resolved.

The 2026-09-06 app-prerequisite update also passed a cold-start check. Before
the update, the stopped guest was saved as `firewall-startup-verified`, including
its disk snapshot and UEFI variables. The user completed the full package
transaction and cold-started the guest. Screenshot
`codex-clipboard-fee48c9b-753e-498a-a6c5-4ac2c65a8c11.png` proves kernel
`7.2.3-arch1-3`, Node `v22.23.2`, npm `12.0.2`, GitHub CLI `2.100.0`, and
Chromium `152.0.7977.82`, followed by all five firewall checks passing. This
establishes the guest prerequisites and post-update firewall persistence. Native
Linux SHELL packaging remains unverified.

Private release access and catalog preparation passed in the Linux guest on
2026-09-06. Screenshot `codex-clipboard-bc9a6a74-baee-4ba1-80e8-c8860276ca40.png`
shows successful GitHub CLI authentication and `Prepared 3 verified app
package(s) for SHELL`. Both npm dependency installations completed; npm reported
12 sidecar dependency vulnerabilities and blocked the two leveldown install
scripts. Full sidecar native-module execution remains unverified.

The isolated three-app browser test passed in the Linux guest at `40cfc605` on
2026-09-06 using `BROWSER_EXECUTABLE_PATH=/usr/bin/chromium npm run test:app-store`.
Screenshot `codex-clipboard-60dc5603-89c4-4e03-ab6f-023d73477619.png` shows the
successful result and returned prompt. The test started with an empty app
directory, installed Scribble, Notes, and Canvas from the reviewed catalog,
reloaded discovery, opened each app, saved and reopened without cross-app data
loss, and exported/reimported Notes and Canvas with no external network requests.
This closes the Linux browser catalog gate. The test uses disposable app and
browser storage; it does not establish a persistent user installation, native
SHELL packaging, full sidecar operation, or the Tenari mobile WebView.

## Resume here

For the physical HP laptop, resume from [HP development](HP-DEVELOPMENT.md).
Its Arch/KDE installation, 51-test repository pass, touchscreen app use, and
browser-app persistence across a full reboot were verified on 2026-09-06.
HP recovery, firewall, and full-sidecar runtime checks remain separate from
the MSI VM evidence below. The user has paused HP work at this milestone.

The Linux guest repository suite also passed on 2026-09-06: screenshot
`codex-clipboard-206c3c83-d3a6-4e72-8b87-8c8d0bc49dce.png` shows 45 tests passed,
zero failures, zero skips, and the returned prompt. This does not exercise every
native dependency in the full sidecar.

Persistent manual browser use passed on 2026-09-06 with `npm run start:apps`
at `http://127.0.0.1:5984`. Screenshots
`codex-clipboard-11e840f2-cc08-4eb9-ae06-781b35f9d4cb.png` and
`Screenshot 2026-09-06 152849.png` show all three apps installed; the user reported
refreshing the page. The user then explicitly confirmed their note persisted
after closing and reopening Chromium, and confirmed persistence again after
closing Chromium, stopping the host with Ctrl+C, restarting `npm run start:apps`,
and reopening the same URL. These are user-reported manual results, alongside
the automated Linux browser proof above. Browser-profile document persistence
and package discovery across host restart are verified. Persistence across a
full guest shutdown, native Linux packaging, and mobile remain separate checks.

The VM was stopped and an offline `firewall-live-verified` checkpoint was created
on 2026-09-05. It includes both the qcow2 disk snapshot and saved UEFI variable
state. The earlier `pre-security-baseline` checkpoint also remains available.

The guest was cleanly shut down after manual persistence verification on
2026-09-06. Offline checkpoint `three-apps-persistence-verified` was created and
confirmed in the qcow2 snapshot list (id 4). Its saved UEFI variables match the
active UEFI file by SHA-256. The VM is stopped, with the working app setup saved.
Before the next security, update, boot, or service change, shut it down and create
a fresh offline checkpoint including both disk and UEFI state if the guest has
changed since this checkpoint. Tenari mobile verification remains separate work.

On 2026-09-06 the first `start-msi-vm.ps1 -Mode Disk` boot of this session failed:
OVMF walked every boot device and stopped at `No bootable device`; the qcow2 was
intact (`qemu-img info` reported `corrupt: false`, snapshot 4 present) and the
only anomaly was the active `uefi-vars.fd` reading SHA-256 `8E1AF521…` instead of
the checkpoint's saved `3D157C2C…`. QEMU was force-stopped and
`three-apps-persistence-verified` was restored with
`manage-msi-vm-checkpoint.ps1 -Action Restore -ConfirmRestore` (reverts disk
snapshot 4 and copies the saved UEFI vars back). The next boot reached SDDM and a
normal Plasma session. After a later clean shutdown OVMF again wrote
`8E1AF521…`, so that value is a normal post-boot NVRAM state, not corruption; the
original failure was most likely a transient first-boot fault that a plain QEMU
relaunch would also have cleared. Prefer relaunching QEMU once before restoring a
checkpoint.

Offline checkpoint `sidecar-linux-deps-verified` (qcow2 snapshot id 5) was then
created on 2026-09-06 after the guest was cleanly shut down, capturing the
post-verification disk with the checkout fast-forwarded to `7b7f5ed`. Its saved
`uefi-vars.fd` was set to the proven-bootable `3D157C2C…` copy rather than the
freshly written `8E1AF521…`. `three-apps-persistence-verified` (id 4) remains the
older proven-good fallback; if id 5 ever fails to boot, restore id 4 and
`git pull` again.

### Full sidecar Linux dependency investigation

Static analysis on 2026-09-06 (Windows checkout, `Shell` at `c447d3b9`) mapped
the whole `node-sidecar` dependency graph: 250 packages in
`node-sidecar/package-lock.json`, and exactly two carry an install script —
`leveldown@6.1.1` (pulled directly by `pouchdb-node@9`) and `leveldown@5.6.0`
(bundled inside `level@6.0.1`, also pulled by `pouchdb-node@9`). Both install
scripts are `node-gyp-build`, which is a no-op when a matching prebuilt binary is
present. Each `leveldown` ships `prebuilds/linux-x64/node.napi.glibc.node` and a
musl variant in its package tree, so on the glibc Arch guest the N-API addon
loads with no compiler, no `node-gyp`, and no `base-devel`. The npm-blocked
install scripts recorded earlier are therefore cosmetic: `node-gyp-build`
re-resolves the prebuild at `require()` time. Every other sidecar dependency is
pure JavaScript. The optional subprocess integrations (`piper`/`aplay`/`ffmpeg`
TTS in `lib/speaker.js`, `blender` in `lib/asset-forge.js`, `rpicam-*` in
`mcp/tools`) are spawned lazily per request and degrade to error objects when the
binary is absent; none are import-time or boot-time dependencies. A Windows
smoke run loaded both `leveldown` copies from their `win32-x64` prebuilds, ran a
`pouchdb-node` put/get/destroy roundtrip, and booted the full sidecar
(`node index.js`) to a loopback `listening` state with `/v1/capabilities`
serving JSON.

`os/guest/bin/verify-shell-sidecar` is the guest-side proof of the same, added
with a matching `tests/os-target.test.js` case (suite now 46 tests). It is
read-only and recovery-safe: it never installs packages or touches system state,
opens its PouchDB store and the sidecar HTTP surface only under a `mktemp -d`
directory on port 5985, asserts each `leveldown` resolves a `prebuilds/<host>`
binary (failing if a compile would be required), runs the database roundtrip,
boots `node index.js` and probes loopback `/v1/capabilities`, then checks that
`node-sidecar/data` — the working `npm run start:apps` browser host — was not
modified. Run it in the guest from the repo root:

```bash
./os/guest/bin/verify-shell-sidecar
```

The verifier passed in the Linux guest on 2026-09-06. With the checkout
fast-forwarded to `7b7f5ed` and Node `v22.23.2`, `./os/guest/bin/verify-shell-sidecar`
printed every PASS line through `SHELL sidecar Linux dependency verification
passed.` Both native lines resolved
`prebuilds/linux-x64/node.napi.glibc.node (linux-x64)` — `leveldown` directly and
`level/leveldown` — confirming no build toolchain is used; the `pouchdb-node`
leveldb roundtrip, the full sidecar boot on `127.0.0.1:5985`, the loopback
`/v1/capabilities` JSON probe, a clean sidecar stop, and the untouched app-host
check (`throwaway dir /tmp/shell-sidecar-verify.vIE2ds, port 5985`) all passed.
This closes the full-sidecar Linux dependency gate. It does not exercise the lazy
TTS/asset-forge/camera subprocess paths or native SHELL packaging.

### Native Linux packaging investigation

Findings from the checkout, not yet built or run:

- The Tauri bundle in `src-tauri/tauri.conf.json` targets `["nsis"]` only.
  `scripts/fetch-node-binary.mjs` pins Node for `win32-x64` only and states
  "macOS/Linux deferred". `bundle.externalBin` is `binaries/node` and
  `bundle.resources` already ships the entire `node-sidecar` tree, including
  `node_modules` with the cross-platform `leveldown` prebuilds, so the sidecar
  and its native addon travel with any bundle once a Linux Node binary exists.
- The boot contract (this plan, "Boot contract") expects the packaged
  executable at `/opt/shell/bin/shell` with the user unit
  `os/guest/systemd/shell-session.service` enabled; `os/guest/bin/shell-session`
  already fails visibly (exit 66) when that binary is missing and never falls
  back to Plasma.
- Tauri v2 Linux builds use `webkit2gtk-4.1` (Arch package `webkit2gtk-4.1`)
  plus `gtk3`; `tauri build` can emit `appimage`, `deb`, and `rpm`. Arch has no
  first-class Tauri target, so a pacman package installing to `/opt/shell` is a
  separate wrapper.

Ordered plan:

1. Add a `linux-x64` entry to `scripts/fetch-node-binary.mjs`
   (`x86_64-unknown-linux-gnu`, `node-v24.18.0-linux-x64` tarball, extract the
   `bin/node`), keeping the pinned version identical to Windows.
2. Add a Linux `bundle` section to `tauri.conf.json` (`targets` including at
   least `appimage`; category and descriptions already present) behind the
   existing per-platform config so the Windows `nsis` path is untouched.
3. On the Arch guest: install `webkit2gtk-4.1`, `gtk3`, `base-devel`, `rust`,
   run `npm ci && npm --prefix node-sidecar ci && node scripts/fetch-node-binary.mjs`,
   then `npm run build`. Capture the produced AppImage under
   `src-tauri/target/release/bundle/`.
4. Prove the AppImage launches the SHELL window, spawns the bundled sidecar on
   loopback, and completes the three-app catalog/install/open/persist flow that
   `npm run test:app-store` covers — with Plasma still available underneath.
5. Only then design the `/opt/shell` install layout (pacman `PKGBUILD` or a
   staged tarball) and wire `shell-session.service`, keeping KDE as the recovery
   session per the recovery rule.

This is the native-packaging dependency path: the guest has passed `verify-shell-sidecar` and the
`sidecar-linux-deps-verified` checkpoint exists. Steps 1-2 are Windows-side repo
edits and can land before the next guest boot. Step 3 pulls `rust`,
`webkit2gtk-4.1`, and `base-devel` into the guest, so shut the guest down and
take a fresh offline checkpoint immediately before starting it.

If WHPX pauses with `Unexpected VP exit code 4`, close and relaunch QEMU, record
the recurrence, and continue the same firewall verification. Do not restore a
checkpoint unless the guest or network actually fails. Clipboard paste has also
occasionally exposed the bracketed-paste prefix `^[[200~`; type short diagnostic
commands manually when that occurs. Neither defect is evidence about firewall
state.

With startup persistence passed, the next O1 build is the narrow privileged
action broker and receipt contract. Do not add VPN-required policy, automatic
blocking, or further firewall grants before that authorization boundary exists.
