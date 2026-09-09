# SHELL OS

The Linux delivery of the same SHELL capability contract used by the Windows bridge — proved in a VM, then a live USB, then an isolated SSD, while the MSI stays a Windows daily driver throughout.

**Built:**
- A machine profile checked in (`targets/msi-gf63-11uc.json`) with known hardware and proof gates (not an installer answer file, and it can't write to disk)
- A read-only host preflight, a pinned Arch installer download/verify, and a disposable VM launcher implemented, defaulting to a proven WHPX acceleration profile with guarded checkpoint create/list/restore
- Guest-side tooling implemented: a read-only health-inventory probe, the SHELL base firewall (install/verify/disable scripts), and a full sidecar Linux dependency verifier — all provably non-mutating or independently reversible
- A boot contract specified: the guest must install to `/opt/shell`, enable a user systemd unit, and start a graphical session with no Tenari/cloud/account requirement, failing visibly rather than falling back to another desktop
- A recovery rule enforced throughout: nothing in this repo partitions or formats the host; the VM disk is disposable; live USB is read-only by default; physical installation requires an explicit non-Windows disk, a verified Windows recovery drive, and a tested way back

**Not built yet:**
- Physical live-USB and isolated-SSD passes (Wi-Fi, Bluetooth, hybrid graphics, audio, camera, suspend, keyboard, touchpad, external display, Secure Boot, recovery all require later live-device proof)
- Everything downstream in `BUILD-PLAN.md` beyond the current guest-only gates
