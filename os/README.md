# CEE OS

The Linux delivery of the same internal Shell capability contract used by the Windows bridge — proved in a VM, then a live USB, then an isolated SSD, while the MSI stays a Windows daily driver throughout. CEE OS is the only user-facing OS name; Shell is retained only for implementation compatibility.

**Built:**
- A machine profile checked in (`targets/msi-gf63-11uc.json`) with known hardware and proof gates (not an installer answer file, and it can't write to disk)
- A read-only host preflight, a pinned Arch installer download/verify, and a disposable VM launcher implemented, defaulting to a proven WHPX acceleration profile with guarded checkpoint create/list/restore
- Guest-side tooling implemented: a read-only health-inventory probe, the SHELL base firewall (install/verify/disable scripts), and a full sidecar Linux dependency verifier — all provably non-mutating or independently reversible
- A boot contract specified: the guest must install to `/opt/shell`, enable a user systemd unit, and start a graphical session with no Tenari/cloud/account requirement, failing visibly rather than falling back to another desktop
- A recovery rule enforced throughout: nothing in this repo partitions or formats the host; the VM disk is disposable; live USB is read-only by default; physical installation requires an explicit non-Windows disk, a verified Windows recovery drive, and a tested way back

**Not built yet:**
- Physical live-USB and isolated-SSD passes (Wi-Fi, Bluetooth, hybrid graphics, audio, camera, suspend, keyboard, touchpad, external display, Secure Boot, recovery all require later live-device proof)
- Everything downstream in `BUILD-PLAN.md` beyond the current guest-only gates
- The adopted Btrfs one-two-three recovery contract and proof: (1) an immutable clean Powerhouse source, (2) the last successfully closed state used for the next launch, and (3) a quarantined Session Trail of automatic checkpoints made while the Powerhouse is running. A successful close validates and promotes the final session state to the next last-good state; failure can step backward within the trail, abandon it for the prior last-good state, or reset to the clean source. App documents remain outside this rotation, and reverting a Powerhouse must not revert or delete user data.
- The adopted app-data attachment: first launch requests a scoped writable data location from Core, creates an understandable app-owned folder and machine-readable manifest, and exposes a plain README explaining purpose, permissions, formats, backup, removal, and restore. Removing or reverting the app leaves this data intact.
