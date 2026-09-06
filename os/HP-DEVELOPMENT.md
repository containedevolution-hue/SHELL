# HP physical development machine

Status recorded 2026-09-06 from user-operated hardware and screenshots in the
HP installation conversation. This is a separate target from the MSI VM;
its results do not qualify the MSI hardware.

## Hardware and installation

- HP Notebook, product X7T50UA#ABA (15-ay009dx), board 81EB, BIOS F.48.
- Intel Core i3-6100U; Intel HD Graphics 520 with Linux i915 loaded.
- Replaced the original 6 GB RAM with two matching Samsung 8 GB
  M471A1K43EB1-CWE modules. BIOS reports 16 GB; HP Memory Fast Test passed
  after testing 15.7 GB. The longer memory test remains uncompleted.
- Internal ST1000LM035-1RK172 1 TB HDD passed HP SMART and Short DST checks.
  These quick tests do not prove complete drive health.
- User explicitly authorized erasing the disposable HP Windows installation.
  Archinstall completed on the internal HDD using the verified 2026.09.01
  Arch USB image. Secure Boot was disabled and confirmed with HP's numeric
  prompt; Legacy Support remained disabled.
- Installed KDE Plasma (plasma-meta), Intel open-source graphics selection,
  SDDM, and NetworkManager default backend. Desktop boot succeeded.
- Hostname shell-hp; local user chris-dev; checkout /home/chris-dev/SHELL.
- Root verified as /dev/sda2[/@], Btrfs with zstd compression. Configuration
  preview showed a 1 GiB FAT32 /boot and @, @home, @log, @pkg subvolumes.

## Verified behavior

- Realtek RTL8188EE Wi-Fi works; DNS and three outbound ping replies passed
  in both the live environment and installed desktop.
- A package download interruption occurred when the phone hotspot left range.
  The installer retry recovered and completed; no reboot/repartition was used.
- eGalax EXC3000 touchscreen detected; evtest produced touch events in the
  live session. User subsequently confirmed working desktop/app touch input.
- Audio controller and Ethernet driver detected, but playback, microphone,
  Ethernet traffic, camera, suspend, battery runtime, and thermals are untested.
- GitHub login and repository clone succeeded. Root npm ci completed with
  zero reported vulnerabilities; sidecar npm ci completed with 12 reported
  vulnerabilities (11 moderate, 1 high) and two leveldown build scripts blocked.
  Neither audit fixes nor blanket script approval were applied.
- prepare-app-catalog.js verified three app packages. npm run start:apps
  served the browser app host at http://127.0.0.1:5984.
- User reported installing Scribble, Notes, and Canvas and exercising them.
  The Notes document "hello sky!" survived browser close/reopen and a separate
  app-host stop/restart, with screenshot evidence of the reopened document.
- Final HP repository test screenshot shows 51 tests passed, zero failures,
  zero skips, and a returned prompt. This followed instructions to run a full
  pacman update, fast-forward the checkout, refresh locked npm dependencies,
  and prepare the catalog. Individual update transaction output and the exact
  HP commit were not captured; do not infer them from the test summary.
- After a full KDE restart, the user restarted the app host and explicitly
  confirmed all installed apps and "hello sky!" remained. Full-machine restart
  persistence is user-verified. This is the accepted stopping milestone.

## Resume and stopping point

The HP runs Arch/KDE plus the SHELL browser app host, not a native SHELL OS
session. The host currently requires a terminal and manual startup:

```bash
cd ~/SHELL
npm run start:apps
```

Use the same Chromium profile and exact loopback URL for browser documents.
Export important documents; browser storage is not a portable backup.

Resume directly from this record; no conversation handoff is needed. Do not
repeat installation or erase the working HP. First inspect its current Git
status/revision and pending system updates, preserving local work and data.
Run the existing isolated ./os/guest/bin/verify-shell-sidecar on the HP; its VM
pass is not HP runtime proof. Before applying system security changes, establish a physical-machine recovery
checkpoint; the MSI VM checkpoints do not cover this HDD. Btrfs support alone
does not establish automated snapshots or tested rollback.

Then install and verify the existing SHELL base firewall, including verification
after reboot and working DNS/outbound access. Continue native Linux packaging
work only from the current owning build plan and with KDE recovery available.
Remaining hardware checks include audio/microphone, camera, suspend/resume,
Ethernet, battery and thermal behavior. Browser document export and a recovery
procedure should be established before treating this as a daily-use machine.

The user requested ending this session and resuming later. Normal shutdown was
explained, but final power-off was not observed. Do not assume the HP is powered
off or that its app host is still running when resuming.

SHELL firewall installation on this HP is not yet verified. Native Linux
packaging and independent session work follow BUILD-PLAN.md; do not infer that
the VM's sidecar or firewall proof has also run on this machine.

An SSD replacement and later optical-bay/chassis/Brics experiments are planned,
not prerequisites for this working development milestone.
