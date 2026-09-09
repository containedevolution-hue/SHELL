# SHELL OS Build Plan

The ordered replacement plan for turning the Arch/KDE development guest into SHELL OS, replacing components only when SHELL needs to own their behavior and has an exercised recovery path.

**Built:**
- A dependency rule decided: keep standard Linux infrastructure (systemd, Wayland, NetworkManager, WireGuard, nftables, PipeWire, BlueZ, Btrfs, Mesa, pacman, Flatpak/portals); progressively replace the Plasma shell, panels, System Monitor, Settings, Discover, Dolphin, notifications, lock screen, and SDDM presentation
- Gate ordering defined: O0 observable core → O1 privileged action boundary → O2 network/security/update/rollback → O3 SHELL surfaces inside Plasma → O4 independent SHELL session → O5 owned startup experience → O6 physical MSI qualification
- O0 passed on the Arch guest: a read-only health-inventory probe correctly reports available and unavailable kernel/CPU/memory/storage/network/VPN/update facts
- O2 (firewall) passed and survived a guest reboot: nftables default-drop inbound/forward, default-accept outbound, DNS and outbound connectivity all verified live and after restart
- The full Node sidecar Linux dependency chain verified: both native `leveldown` copies resolve prebuilt binaries with no compiler needed; a guest-side non-mutating verifier confirms the PouchDB roundtrip and a full sidecar boot without touching the working browser-host data
- The native Linux packaging path scoped: Tauri's Linux target set to `nsis`+`appimage`, a pinned Linux Node binary fetch added, a boot-contract systemd unit specified; the optimized native executable itself builds successfully on the physical HP
- The browser-app catalog gate passed on Linux: a disposable three-app install/open/save/export/reimport cycle completed with no external network requests

**Not built yet:**
- AppImage assembly itself: `linuxdeploy` still fails on a foreign musl `leveldown` prebuild inside the generated AppDir even after host-native dependency staging was added — the open blocking defect
- O1's narrow privileged action broker and receipt contract (explicitly the next build, blocking further VPN/firewall/blocking policy)
- O3 (a native Security & Performance Center and other SHELL surfaces inside Plasma), O4 (an independent SHELL login session), O5 (an owned startup/lock/first-boot experience), O6 (physical MSI hardware qualification: Secure Boot, firmware, hybrid graphics, thermals, suspend, peripherals)
- A resolved WHPX "Unexpected VP exit code 4" launcher defect (currently worked around by relaunching QEMU, not fixed)
