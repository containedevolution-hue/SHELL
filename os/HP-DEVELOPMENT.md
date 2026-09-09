# HP Physical Development Machine

Status of the physical HP laptop used for SHELL OS development — a separate target from the MSI VM; its results don't qualify the MSI.

**Built:**
- Arch/KDE installed on the HP's internal HDD (Secure Boot disabled, Btrfs root with zstd, standard subvolume layout); RAM upgraded to 16GB and passed a quick memory test; the internal HDD passed SMART/short DST checks
- Core hardware verified working: Wi-Fi with DNS/outbound connectivity, eGalax touchscreen input, desktop/app touch input
- The repository checked out and dependencies installed; the app catalog prepared and served; Scribble/Notes/Canvas installed and exercised, with document persistence proven across browser close/reopen, app-host restart, and a full machine restart
- The full repository test suite passed on the HP
- A physical delivery checkpoint reached: the sidecar Linux dependency verifier passed with the system Node; two Btrfs recovery snapshot sets taken before risky changes; the SHELL firewall installed and verified live and after a full reboot; native build prerequisites installed; the optimized native Tauri executable builds successfully
- The native desktop/Files acceptance slice delivered via a `--no-bundle` dev build and a per-user KDE launcher
- Wired LAN connectivity restored after a cable/IP fix; the HP was later shown controlling the MSI over RustDesk in one observed session

**Not built yet:**
- AppImage assembly: `linuxdeploy` still fails on a foreign musl `leveldown` prebuild in the generated AppDir
- Persistence across reboot and a verified private Claw server for the RustDesk connection (only observed once, not confirmed durable)
- Remaining hardware checks: audio/microphone, camera, suspend/resume, Ethernet reliability, battery, thermals
- A tested recovery procedure and browser-document export routine before treating the HP as a daily-use machine
- The Hyprland test session itself (see `CHAT-HYPRLAND-TEST.md`) — not yet attempted on this machine
