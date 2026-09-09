# Data and Sync

SHELL owns local data, optional cloud storage, and sync services; each app owns its own document models. Tenari is optional and never a prerequisite. Local app use works with no CE Account, Tenari, Chat, or cloud connection.

**Built:**
- Ownership split decided: CE Account (Apps) owns identity/auth/recovery/enrollment intent; Shell owns storage authorization, quotas, manifests, revisions, transfer, conflict/deletion, and restore mechanics — CE sign-in alone never grants OS/file/remote-session/provider access
- Sync requirements defined for any store enrolled in optional SHELL Cloud: owner-scoped identity/versioning, committed-order cursors, idempotent mutations, explicit conflict/deletion semantics, a per-account device cache/outbox, and server-side authorization on every read/write; realtime never replaces the durable change feed; conflict handling never silently uses last-writer-wins; detach/account-switch never deletes authoritative local data
- Secrets boundary defined: provider keys/passwords/cookies, CE tokens, OS grants, pairing keys, and Tenari Stardust authority never enter portable app data, backups, or the general sync feed

**Not built yet:**
- SHELL Cloud itself (still future work): private object storage, manifests, checksums, revisions, quotas, encryption, lifecycle state, metadata-first sync
- Shell's own local/cloud encryption and recovery boundary (Tenari's existing encryption work is not inherited)
- Migrating current Tenari-hosted app stores and the legacy SHELL replication path off their implementation seams
