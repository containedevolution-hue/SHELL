# SHELL Security and System Health Foundation

Security and performance controls work offline, without an account, companion, or cloud connection. Tenari may explain observations through a separately granted capability and never receives ambient access.

**Built:**
- Product rules set: understandable/recoverable secure defaults, local-only security state unless explicitly exported, plain warnings (fact, range, impact, action — no vague red banners), no autonomous enforcement in the first release, Tenari can explain but never owns a security decision
- Threat model scoped: exposed network services, malicious downloads, credential theft, untrusted persistence, privilege escalation, vulnerable packages, tampered executables, unsafe removable devices, ransomware/data loss, and unbootable updates — explicitly not a complete-safety promise
- Local architecture designed: sensors (kernel/service facts) → normalizer (versioned health-event contract) → local history (bounded SQLite) → policy engine (inspectable/reversible rules) → action broker (PolicyKit/hardened systemd, never wholesale root) → Security & Performance Center UI
- Network/VPN model decided: NetworkManager stays the authority, WireGuard is the preferred first tunnel engine, four named policies (Direct/Prefer/Require/Recovery), no home-grown VPN network, nftables deny-by-default with explicit named grants
- VPN use is optional. Profiles enter through a provider-neutral profile importer, secrets use the system secret service, and Recovery: a time-limited local action restores access for repair.
- Arch partial upgrades are unsupported. The updater creates a Btrfs snapshot before one complete signed package transaction; Unattended installation is opt-in after rollback is proven.
- Scanning/containment model decided: ClamAV at download boundaries (labeled a file scanner, not full endpoint defense), pacman signature/ownership verification, systemd sandboxing, Flatpak/bubblewrap preference, fwupd/LVFS for firmware, USBGuard only after a learning mode, journald as the first audit source
- No first release automatically kills a process. Alerts require both a meaningful deviation and supporting evidence, and describe behavior as “unusual,” not “malicious.”
- A native read-only Security collector now reports NetworkManager state, active VPN connections, and the managed nftables service to the exact local CEE OS desktop; unsupported platforms report unavailable instead of inventing state.

**Not built yet:**
- The S0–S5 build order: a read-only inventory contract and CLI collector → safe base controls in a VM → update transaction and rollback proof → the native Security & Performance Center UI → scanning/containment integration → physical MSI proof (encryption, Secure Boot, firmware, thermals, suspend, peripherals)
- Deliberately excluded from this first milestone: home-grown cryptography/VPN protocol/malware engine/kernel module, automatic AI process killing, eBPF-based observability
