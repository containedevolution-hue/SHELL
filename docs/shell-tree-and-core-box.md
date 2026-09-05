# SHELL Tree and Core Box

SHELL Tree is the operating environment's central spatial view of files, installed applications, projects, storage, and live system activity. Core Box is the control plane beneath the tree for AI connections, scoped access, project boot instructions, assistant memory, and SEED export and recovery. Neither surface replaces the stores it projects.

## Names and boundaries

- **SHELL Tree** is the OS filesystem and application graph. It replaces “Memory Tree” as the customer-facing name for SHELL's central storage surface.
- **Memory Grove** is Tenari's personal surface for canonical autobiographical Memory, Ripening, provenance, roots, reflection, and deletion. It is not a filesystem.
- **Core Box** is SHELL's owner-controlled AI and project context console. It is a control plane, not a universal database.
- **Memory Box** is the Core Box area containing assistant-specific memory slots, project context manifests, curated Memory Grove exports explicitly supplied by the owner, and the instructions an assistant reads when entering a project.
- **SEED** is the local capture, curation, export, backup, and restore application inside Core Box. A SEED backup is a snapshot or archive, never the live authority for the data it protects.

## Tree layout

The tree keeps custody visible instead of presenting one undifferentiated hierarchy.

- **System Files** branches contain the initial SHELL operating environment, bundled system surfaces, drivers, services, recovery assets, and immutable or administrator-controlled paths. They are visually distinct and protected from ordinary app writes.
- **Aftermarkets** branches contain owner-installed applications, plugins, drivers, models, and integrations. “Aftermarkets” is the customer-facing group label; every item still declares its publisher, signature, version, permissions, storage locations, and removal behavior.
- **Apps and Projects** occupy the central working branches. Each node opens as another circular node graph rather than dropping into a conventional file-manager list. Folder and file semantics remain real underneath, with a list/details mode available for precision, accessibility, bulk operations, and recovery.
- **Local, removable, network, and cloud custody** remain explicit. A connection may make another store visible without silently copying it into local storage.

Circular nodes are a view over canonical paths and typed manifests. Moving a visual node does not move bytes unless the user invokes an explicit file operation. Links, aliases, mounted stores, app records, and physical files remain distinguishable.

## Status bar

A persistent instrument strip runs across the top of every SHELL Tree section. It uses the System Dashboard telemetry contract and shows only decision-useful gauges by default:

- processor, memory, storage pressure, network, battery/power, and temperature;
- active apps, background jobs, workflow queues, local models, and external-provider activity;
- current section size, indexed items, pending sync/backup work, and unavailable or stale readings.

Each gauge opens its source, freshness, consumers, trend, warning meaning, and safe actions. Gauges never expose document contents, prompts, credentials, or private payloads.

## Trunk connections

The trunk carries a connection control immediately below the SHELL label, represented by opposing arrows and a live count.

- **White:** no active connections and no known fault.
- **Green:** one or more authenticated, reachable connections; the number is the live connection count.
- **Red:** at least one selected or expected connection has an authentication, permission, reachability, or protocol error.
- **Mixed state:** green count plus a red fault badge when healthy and failed connections coexist; one red connection never makes healthy connections disappear.

Opening the control lists MCP clients and servers, provider APIs, paired devices, mounted network/cloud stores, app integrations, and local model runtimes separately. Discovery, authentication, reachability, permission, and current activity are distinct fields. A connection count never implies file or memory authority.

## Core Box and AI path

All assistants use one simple admission path:

1. **Connect:** establish a versioned local, MCP, or provider adapter with a stable assistant identity.
2. **Grant:** the owner selects readable roots, writable roots, allowed tools, assistant-memory slot, duration, and revocation behavior. Read and write are separate.
3. **Boot:** the assistant receives the selected project's entry file, normally `README.md` or an explicitly chosen alternative, plus a bounded manifest of mounted sources and capabilities.
4. **Operate:** the assistant navigates only mounted sources and invokes versioned capabilities. Files, app records, Memory Grove, assistant memory, and SEED remain separate source types.
5. **Audit:** SHELL records requests, grants, reads, writes, external disclosure, errors, and revocation without logging credentials or private payloads unnecessarily.

An instruction file explains how to work; it never grants access, overrides SHELL policy, widens a mount, or turns retrieved text into trusted commands. Provider credentials stay in the credential vault and are never placed in an instruction file or model-visible memory.

## Memory Box

Memory Box is the project-and-assistant context area within Core Box. It contains:

- project cards with canonical root, entry instruction file, allowed related roots, app links, and recent activity;
- one isolated AI-memory slot per assistant;
- owner-approved, provenance-preserving exports from Tenari Memory Grove;
- curated SEED datasets or retrieval indexes explicitly mounted for a task;
- quick controls for inspect, connect, disconnect, export, revoke, and delete.

Memory Box does not copy a whole filesystem merely to make it AI-readable. It stores manifests and context artifacts while the source remains in its owning file, app, Memory Grove, assistant slot, or SEED corpus.

## SEED backup and restore

SEED adds five visibly separate backup lanes:

- **Files backup** for selected owner files and app documents;
- **System backup** for SHELL configuration, installed-component manifests, recovery state, and supported system data;
- **Project backup** for a project's files, instructions, dependency manifest, and selected AI context;
- **Memory backup** for owner-authorized exports from Memory Grove and assistant-memory slots, preserving source and consent boundaries;
- **Full SEED backup** for the complete raw corpus, blob pool, derived projections, schemas, keys manifest, and verification metadata.

Every backup is versioned, encrypted, checksummed, restorable without a provider, and explicit about excluded credentials, hardware-bound secrets, caches, and unavailable sources. Restore begins with inspection and compatibility checks, supports selective restore, refuses silent overwrite, and produces a receipt. Full SEED backup requires stronger local-owner authentication and is not exposed through ordinary AI or integration grants.

## Accessibility and recovery

- Every spatial tree action has keyboard, screen-reader, reduced-motion, high-contrast, list/details, breadcrumb, search, and direct-path equivalents.
- The tree can rebuild from canonical paths and manifests; visual layout corruption never loses files.
- Broken links, unavailable mounts, permission denial, stale indexes, and backup gaps are shown as different states.
- System recovery remains reachable when AI providers, SEED, Tenari, the network, or the graphical tree is unavailable.

Implementation sequence lives in `Shell/docs/build-orders/SHELL-Tree-and-Core-Box.md`. System gauges remain owned by `Shell/docs/surfaces/System-Dashboard.md`; canonical autobiographical Memory remains owned by `Tenari/memory/memory-tree/Memory-Grove.md`; AI slot conformance remains owned by `memory/ledger/build-orders/AI-Memory-Contract.md`.
