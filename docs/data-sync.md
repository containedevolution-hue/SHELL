# Data and Sync

SHELL owns its local data, optional cloud storage, and synchronization services. Each portable app owns its document models, migrations and eligible export data. Tenari is an optional integration and is never a prerequisite or the owner of Shell sync. Sync transports owned data; it does not change its owner or permission boundary. Local app use remains available without a CE Account, Tenari, Chat or a cloud connection.

## SHELL Cloud

SHELL Cloud remains future work. It will consume the canonical CE Account identity owned by Apps account services, rather than introduce a separate Shell cloud password/account authority. [CE identity architecture](../../Apps/memory/ledger/build-orders/CE-Identity-and-Accounts.md) owns that cross-product plan; the current [CE Account foundation](../../Apps/contracts/v1/ce-account.md) is a private local prototype, not a production issuer or working Shell login.

CE Account owns the CE subject, account profile, authentication/recovery and account-facing enrollment intent. Shell owns storage authorization, quotas, manifests, revisions, transfer, conflict/deletion handling and restore mechanics. Apps Account may display these Shell-owned facts and coordinate explicit enrollment; Chat may navigate to that account surface. Neither surface becomes a second store, synchronization engine or grant authority. CE sign-in alone never enrolls all local data or grants OS, file, remote-session or provider access. Local OS login/unlock and local profile identity remain distinct from CE identity.

Local stores remain authoritative. A store enrolled in optional SHELL Cloud requires:

- owner-scoped identity and versioning;
- committed-order cursors and idempotent mutations;
- explicit conflict and deletion semantics;
- an account-scoped device cache and ordered outbox;
- authorization on every server read and write.

Realtime may wake a client but never replaces the durable change feed. Conflict handling preserves user content; it does not silently use last-writer-wins. Detaching a cloud account removes its cloud credentials and cloud reach without deleting authoritative local data. Account switching partitions caches/outboxes and stops the previous account's queued writes. A cloud outage or account detachment does not disable ordinary local use. Deletion epochs or tombstones prevent delayed offline resurrection. CE recovery cannot unlock local encryption, restore an OS grant or re-pair a remote session.

## Local data, files, and secrets

- Remote use of local/private data sends authorized requests to SHELL; it does not silently copy data into Tenari or another integration.
- Another device reaches that data only through the same authorized SHELL path, and the UI states this boundary.
- SHELL Cloud binaries will use private object storage with owned manifests, checksums, revisions, quotas, encryption, and lifecycle state. Devices sync metadata first and fetch bytes lazily unless pinned. [Files](surfaces/Files.md) owns the user-facing storage model.
- Sessions are device-specific revocable authority, not sync records.
- Provider keys follow their declared custodian's credential-vault contract. Provider passwords/cookies, API keys or broker ciphertext, CE authenticators/session tokens, OS grants, pairing/private device keys and Tenari Stardust authority never enter portable app data, ordinary backups or the general sync feed. Restoring labels or opaque references recreates no authority.
- Tenari's existing cloud content encryption and provider-key migration are owned by [Tenari Encryption](../../Tenari/memory/platform/Encryption.md) and [Tenari Provider Key Custody](../../Tenari/memory/ledger/build-orders/Provider-Key-Custody.md). They describe Tenari's custody, not an inherited Shell or CE Account encryption implementation. Shell must publish and prove its own local/cloud encryption and recovery boundary before making corresponding protection claims; no private implementation is copied across repositories.

Current Tenari-hosted app stores and the legacy SHELL replication path are implementation seams to migrate, not the target ownership model.

Never use a whole-database clone, an allocation-order database sequence as a convergence cursor, or the service-worker cache for private structured account data. Sync never widens app, file, SEED, Tenari, integration, or provider-key permissions.
