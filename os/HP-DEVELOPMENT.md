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

## Resume and stopping point

The HP runs Arch/KDE plus the SHELL browser app host, not a native SHELL OS
session. The host currently requires a terminal and manual startup:

```bash
cd ~/SHELL
npm run start:apps
```

Use the same Chromium profile and exact loopback URL for browser documents.
Export important documents; browser storage is not a portable backup.

Next: complete a full system update and fast-forward the checkout, refresh
locked dependencies/catalog if needed, run npm test and the existing isolated
sidecar verifier, then verify a full HP shutdown/startup and reopening the note.
These update/check results and full-machine persistence are not yet evidenced.
Before applying system security changes, establish a physical-machine recovery
checkpoint; the MSI VM checkpoints do not cover this HDD. Btrfs support alone
does not establish automated snapshots or tested rollback.

SHELL firewall installation on this HP is not yet verified. Native Linux
packaging and independent session work follow BUILD-PLAN.md; do not infer that
the VM's sidecar or firewall proof has also run on this machine.

An SSD replacement and later optical-bay/chassis/Brics experiments are planned,
not prerequisites for this working development milestone.
