# SHELL security and system health foundation

SHELL treats security and performance as one local operating-system service,
not as scattered utilities or a Tenari feature. It must work offline, without an
account, and without any companion or cloud connection.

## Product rules

- Secure defaults must remain understandable and recoverable by the owner.
- Security state, evidence, and controls belong to SHELL and remain local unless
  the owner explicitly exports or syncs them.
- Warnings explain the observed fact, the expected range, likely impact, and the
  exact proposed action. SHELL does not use vague red danger banners.
- No first release automatically kills a process, quarantines a file, blocks a
  device, or changes firmware. Observation comes before autonomous enforcement.
- Tenari may explain a result through a granted capability; it never receives
  ambient access to security events or owns a security decision.

## Threats in scope

The first threat model covers exposed network services, malicious downloads,
credential theft, untrusted application persistence, privilege escalation,
vulnerable packages, tampered executables, unsafe removable devices, ransomware
or accidental data loss, and an update that leaves the machine unbootable.

This is defense in depth, not a promise that one scanner, firewall, or VPN makes
the computer safe. Physical theft, firmware compromise, and MSI-specific Secure
Boot behavior remain separate hardware proof gates.

## Local architecture

1. **Sensors** read kernel and service facts from `/proc`, `/sys`, cgroups v2,
   systemd/journald, NetworkManager, nftables, hwmon, storage health, and package
   metadata. Sensors never need cloud access.
2. **Normalizer** converts facts into a versioned SHELL health-event contract
   with source, timestamp, scope, unit, confidence, and evidence.
3. **Local history** stores bounded metric summaries and security events in the
   authoritative SHELL SQLite database. Raw high-frequency samples expire.
4. **Policy engine** compares current facts with explicit rules and learned local
   baselines. Every policy is inspectable and reversible.
5. **Action broker** exposes narrowly privileged operations through PolicyKit
   and hardened systemd services. The desktop never runs wholesale as root.
6. **Security & Performance Center** presents state, history, explanations,
   controls, recovery, and developer-level evidence in SHELL language.

## Network and VPN-first behavior

NetworkManager remains the network authority. WireGuard is the preferred first
tunnel engine because Linux and NetworkManager support it natively. SHELL owns a
provider-neutral profile importer and four clearly named policies:

- **Direct:** no tunnel requested.
- **Prefer private connection:** connect the selected tunnel automatically, but
  retain normal access when it is unavailable.
- **Require private connection:** a user-enabled kill switch permits only tunnel
  establishment, the tunnel itself, and explicitly listed exceptions.
- **Recovery:** a time-limited local action restores direct networking so a bad
  profile, captive portal, expired account, or provider outage cannot strand the
  machine.

VPN use is optional and is not enabled merely because a profile exists. SHELL
does not operate a VPN network in the first release; it accepts standard
WireGuard profiles from the owner's chosen provider or self-hosted endpoint.
Secrets use the system secret service, never SQLite, logs, or sync.

The base firewall uses nftables with deny-by-default unsolicited inbound traffic,
stateful replies, loopback, DHCP, and required ICMP/IPv6 control traffic. App,
development-server, LAN, Brics, and discovery access are explicit named grants.

## Updates and recovery

Arch is rolling release and partial upgrades are unsupported. SHELL therefore:

1. checks Arch news and available packages without creating a partial-upgrade
   state;
2. shows package, size, restart, intervention, and risk information;
3. creates a Btrfs snapshot and verifies boot/recovery space;
4. performs one complete signed package transaction in a chosen maintenance
   window;
5. records `.pacnew`/`.pacsave` work and services that require restart;
6. runs boot, network, desktop, storage, and SHELL health checks;
7. offers the last known-good snapshot when verification fails.

Automatic checking and downloading may be on by default. Unattended installation
is opt-in only after snapshot and rollback have been proven in the VM and then on
an isolated physical disk. Image-based atomic delivery with `systemd-sysupdate`
and dm-verity is a later SHELL distribution option, not a shortcut around the
current pacman system.

## Scanning, integrity, and application containment

- **ClamAV:** on-demand and download-boundary file scanning with signed signature
  updates. It is labeled a malware file scanner, not complete endpoint defense.
- **Package verification:** pacman signatures plus recorded package ownership and
  hashes distinguish packaged changes from unexplained executable changes.
- **Services:** systemd sandbox directives and `systemd-analyze security` guide
  least-privilege service profiles.
- **Applications:** Flatpak portals/bubblewrap are preferred for suitable
  third-party GUI apps; Landlock is evaluated for SHELL-managed file boundaries.
- **Firmware:** fwupd/LVFS is the preferred update seam where the MSI exposes
  supported firmware. Availability must be proven on physical hardware.
- **Devices:** removable media starts with visible identity and mount state;
  optional USBGuard enforcement comes only after a recovery-safe learning mode.
- **Audit:** journald is the first event source. Audit rules are narrow and
  measured; collecting everything would create noise and sensitive local data.

## Dev-friendly performance model

Gauges are reserved for bounded capacity: CPU/GPU load and temperature, memory,
storage, battery, and current network throughput relative to the observed link.
Trends use sparklines; processes use sortable tables; security changes use an
event timeline. Every friendly label can expand to the raw source and unit.

The first process baseline is transparent and local. It learns time-of-day and
foreground/background ranges for CPU, memory, disk I/O, network volume,
destinations, crashes, and restarts. Alerts require both a meaningful deviation
and supporting evidence. A new workload is presented as “unusual for this app,”
not “malicious.” Users can accept a new baseline, inspect it, or remove it.

Hardware adapters are replaceable: procfs/cgroups for processes, hwmon and
lm-sensors for temperatures, smartmontools/NVMe health for storage, Intel GPU
telemetry in the VM/physical pass where available, and NVIDIA NVML only after the
proprietary-driver path is proven. Missing sensors display **not available**, not
zero or healthy.

## Build order

### S0 — contract and read-only inventory

Define versioned health events, metric samples, alerts, policy state, and action
receipts. Build a CLI collector for CPU, memory, storage, network, processes,
services, firewall, update, and VPN state. No elevated writes.

### S1 — safe base controls in the VM

Add declarative nftables rules, NetworkManager/WireGuard profile discovery,
signed-package/update checks, journald event adapters, and a one-command recovery
report. Prove direct networking and recovery before testing a kill switch.

### S2 — update transaction and rollback

Create a VM snapshot, run a complete update, verify health, deliberately test a
failed verification, and recover. Then map Btrfs snapshot behavior inside the
guest. No physical-drive claim follows from VM success.

### S3 — SHELL Security & Performance Center

Build the native SHELL surface over the contracts: Overview, Processes, Network,
Updates, Storage, Devices, Applications, Events, and Recovery. KDE System Monitor
is a useful temporary diagnostic and reference, not the product UI.

### S4 — scanning and containment

Integrate ClamAV at FETCH/download/import boundaries, package integrity, hardened
SHELL services, and sandboxed third-party application launches. Measure latency
and false positives before enabling automatic blocking.

### S5 — physical MSI proof

On live USB and then the isolated SSD, verify encryption, Secure Boot/UKI signing,
firmware updates, Intel/NVIDIA telemetry, thermal behavior, suspend, battery,
Wi-Fi, Bluetooth, camera, audio, removable devices, recovery, and update rollback.

## Deliberate exclusions from the first milestone

No home-grown cryptography, VPN protocol, malware engine, kernel security module,
or automatic AI process killer. eBPF may later improve observability, but it is
not required to build trustworthy first-party metrics and creates avoidable
privileged complexity at this stage.

