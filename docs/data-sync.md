# Data and Sync

SHELL owns local data, optional cloud storage, and synchronization for its core apps. Tenari is an optional integration and is never a prerequisite or sync owner. Sync transports owned data; it does not change its owner or permission boundary.

## SHELL Cloud

Local stores remain authoritative. A store enrolled in optional SHELL Cloud requires:

- owner-scoped identity and versioning;
- committed-order cursors and idempotent mutations;
- explicit conflict and deletion semantics;
- an account-scoped device cache and ordered outbox;
- authorization on every server read and write.

Realtime may wake a client but never replaces the durable change feed. Conflict handling preserves user content; it does not silently use last-writer-wins. Detaching a cloud account removes its credentials and remote reach without deleting authoritative local data. Deletion epochs or tombstones prevent delayed offline resurrection.

## Local data, files, and secrets

- Remote use of local/private data sends authorized requests to SHELL; it does not silently copy data into Tenari or another integration.
- Another device reaches that data only through the same authorized SHELL path, and the UI states this boundary.
- SHELL Cloud binaries use private object storage with owned manifests, checksums, revisions, quotas, encryption, and lifecycle state. Devices sync metadata first and fetch bytes lazily unless pinned. Storage owns the user-facing model in `Shell/docs/surfaces/Files.md`.
- Sessions are device-specific revocable authority, not sync records.
- Provider keys follow their credential-vault contract. SHELL credentials remain scoped device authority and never enter the general data feed.
- Encryption and key custody are owned by `memory/platform/Encryption.md` and `memory/ledger/build-orders/Provider-Key-Custody.md`.

Current Tenari-hosted app stores and the legacy SHELL replication path are implementation seams to migrate, not the target ownership model.

Never use a whole-database clone, an allocation-order database sequence as a convergence cursor, or the service-worker cache for private structured account data. Sync never widens app, file, SEED, Tenari, integration, or provider-key permissions.
