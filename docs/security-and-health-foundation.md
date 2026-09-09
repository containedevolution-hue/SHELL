# SHELL Security and System Health Foundation

Treats security and performance as one local OS service — works offline, without an account, companion, or cloud connection.

**Built:**
- Product rules set: understandable/recoverable secure defaults, local-only security state unless explicitly exported, plain warnings (fact, range, impact, action — no vague red banners), no autonomous enforcement in the first release, Tenari can explain but never owns a security decision
- Threat model scoped: exposed network services, malicious downloads, credential theft, untrusted persistence, privilege escalation, vulnerable packages, tampered executables, unsafe removable devices, ransomware/data loss, and unbootable updates — explicitly not a complete-safety promise
- Local architecture designed: sensors (kernel/service facts) → normalizer (versioned health-event contract) → local history (bounded SQLite) → policy engine (inspectable/reversible rules) → action broker (PolicyKit/hardened systemd, never wholesale root) → Security & Performance Center UI
- Network/VPN model decided: NetworkManager stays the authority, WireGuard is the preferred first tunnel engine, four named policies (Direct/Prefer/Require/Recovery), no home-grown VPN network, nftables deny-by-default with explicit named grants
- Update/recovery model decided: check-without-partial-upgrade, a Btrfs snapshot before one complete signed transaction, health checks after, rollback to last-known-good on failure; unattended installation gated behind proven snapshot/rollback
- Scanning/containment model decided: ClamAV at download boundaries (labeled a file scanner, not full endpoint defense), pacman signature/ownership verification, systemd sandboxing, Flatpak/bubblewrap preference, fwupd/LVFS for firmware, USBGuard only after a learning mode, journald as the first audit source
- Dev-friendly performance model decided: bounded-capacity gauges, a transparent local process baseline that learns time-of-day ranges, "unusual for this app" framing instead of "malicious," replaceable hardware adapters, missing sensors shown as unavailable rather than zero

**Not built yet:**
- The S0–S5 build order: a read-only inventory contract and CLI collector → safe base controls in a VM → update transaction and rollback proof → the native Security & Performance Center UI → scanning/containment integration → physical MSI proof (encryption, Secure Boot, firmware, thermals, suspend, peripherals)
- Deliberately excluded from this first milestone: home-grown cryptography/VPN protocol/malware engine/kernel module, automatic AI process killing, eBPF-based observability
