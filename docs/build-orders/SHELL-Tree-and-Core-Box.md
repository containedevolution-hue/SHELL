# SHELL Tree and Core Box

Build SHELL Tree as the central OS filesystem/application graph and Core Box as its bounded AI, project-context, connection, backup, and recovery control plane. Product behavior is owned by `../shell-tree-and-core-box.md`; this order owns only the unfinished cross-system sequence.

## Current seam

- SHELL's canvas already presents a central tree metaphor, local documents, app bubbles, capability discovery, jailed filesystem access, audit, and default-deny browser reach.
- Tenari already exposes bounded Memory MCP reads and evidence proposals, but the SHELL Tree, Memory Grove, assistant-memory slots, and SEED are not one store.
- SEED has a local append-only corpus and ingest importer in the temporary Tenari `localhub/` copy. Backup lanes, restore, curation, and the owner-facing Core Box surface are not built.
- System Dashboard defines the gauge behavior, but there is no shared top instrument strip over a filesystem tree.
- The connection state is fragmented across provider settings, pairing, MCP, browser grants, local models, and cloud reach.

## Build order

1. **Freeze names and source types.** Introduce SHELL Tree, Core Box, Memory Box, Memory Grove, and Aftermarkets in schemas and UI copy while preserving compatibility routes. Define typed nodes for physical path, app record, project, link, mount, assistant memory, Memory Grove export, and SEED artifact.
2. **Publish the tree index contract.** Index canonical paths and manifests without becoming their store. Define stable node identity, custody, parent/link relations, availability, permissions, size, freshness, and rebuild behavior.
3. **Build the accessible navigator.** Implement circular expansion, zoom, breadcrumbs, search, keyboard and screen-reader traversal, reduced motion, high contrast, and a precision list/details mode over the same model.
4. **Separate system and aftermarket branches.** Inventory preinstalled system components and owner-installed items from package/application manifests. Prove protected system paths cannot be reclassified or modified through a visual drag.
5. **Mount apps and projects.** Add project roots, entry instruction files, app-owned records, aliases, removable media, network stores, and cloud stores without collapsing their ownership or moving bytes implicitly.
6. **Unify connection status.** Publish one connection-state contract for MCP, provider APIs, paired devices, storage mounts, app integrations, and local models. Drive the trunk arrows, live count, mixed fault badge, repair routes, and audit from that contract.
7. **Build Core Box grants.** Implement assistant identity, read roots, write roots, tool scopes, memory slot, expiry/revocation, external-disclosure policy, and per-project boot manifests. Prove instruction files cannot widen authority.
8. **Build Memory Box.** Add project cards, assistant-specific slots, owner-approved Memory Grove exports, mounted SEED datasets, context manifests, and inspect/revoke/export/delete controls without copying whole source stores.
9. **Add the instrument strip.** Reuse System Dashboard telemetry for system resources, active apps/jobs/models/providers, section size, index state, and backup/sync queues. Prove privacy, freshness, limits, and stop behavior.
10. **Build SEED backup lanes.** Implement encrypted, checksummed Files, System, Project, Memory, and Full SEED snapshots with manifests, exclusions, retention, destination health, and scheduled/manual operation.
11. **Build restore and disaster recovery.** Add preflight, compatibility/migration, selective restore, conflict preview, no-silent-overwrite behavior, post-restore verification, receipts, and a non-graphical recovery path.
12. **Connect Tenari Memory Grove.** Rename the personal surface without changing canonical Memory authority. Export into Memory Box or SEED only through explicit, provenance-preserving operations; external proposals still enter Ripening rather than accepted Memory.
13. **Move ownership into SHELL.** Publish the contracts and implementation in the standalone SHELL repository, migrate tests, and remove the temporary Tenari-owned implementation seams only after adapters and rollback pass.

## Evidence gates

- A rebuilt index produces the same nodes without changing source bytes.
- A visual move, link, mount, copy, and delete have distinguishable receipts and failure behavior.
- System paths resist ordinary writes and aftermarket uninstall leaves owned user data according to its declared policy.
- Two assistants with different grants cannot see each other's roots or memory slots; revocation stops undispatched work immediately.
- A malicious instruction or retrieved file cannot widen a grant or invoke an undeclared tool.
- The connection count agrees with authenticated reach and shows simultaneous healthy and failed connections honestly.
- Gauges disclose source and freshness and never leak prompts, file content, credentials, or workflow payloads.
- Each backup lane restores independently; corrupted, incomplete, wrong-key, wrong-version, and interrupted backups fail safely.
- Full SEED restore reproduces corpus and projections from verified source material while remaining inaccessible to ordinary integrations.
- Memory Grove export and re-import preserve provenance and never bypass Ripening or create duplicate canonical facts.

## Completion

Delete this order when SHELL owns the shipped contracts and surfaces, spatial and precision navigation operate over the same rebuildable index, Core Box grants and connection state pass isolation tests, all five SEED backup lanes pass restore drills, and Tenari Memory Grove remains a distinct canonical personal-memory system.
