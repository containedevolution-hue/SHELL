# SHELL's Core

SHELL's Core is the operating environment's central surface: a multi-window desktop object that rests at the top centre of the desktop and expands to full screen when opened. It projects the stores, applications, connections, and system activity beneath it and owns none of them; admission, storage, retrieval, and deletion stay with each projected owner.

The Core renders the Contained Evolution mark literally: an engraved base cube, a trunk, and a canopy of linked globes.

## Anatomy

**The Box** is the base cube: the boot surface and the origin of every connection. It carries the environment identity, the boot process, and the point from which connection conduits rise into the trunk. Opening the Core places the Box at the bottom of the full-screen view.

**The Trunk** is the conduit between the Box and the canopy. Each live connection — provider API, Wi-Fi, MCP client or server, paired device, mounted store — appears as its own glowing conduit running up the trunk, drawn when the connection is established and removed when it is torn down.

- **Green** — authenticated, reachable, and error-free.
- **Red** — an authentication, permission, reachability, or protocol error on that connection.
- **Yellow** — configured but idle or switched off.

A conduit count never implies file or memory authority. One red conduit never hides the healthy ones; a mixed state shows every conduit in its own colour.

**The Canopy** is the linked globe network. Each globe is a labelled category surface:

- **Pre-installed Apps** — bundled system applications and surfaces.
- **Aftermarket Apps** — owner-installed applications, plugins, drivers, models, and integrations. Each declares its publisher, signature, version, permissions, storage locations, and removal behaviour.
- **Contained Evolution Monorepo** — the canonical Contained Evolution application set and its host adapters.
- **Memory Box** — the assistant memory, training, and boot filesystem described below.
- **SEED** — the sealed local capture-and-curation plugin, nested under Memory Box.
- **Photos & Videos** — the owner's image and video library, a SHELL system surface backed by local disk, deduplication, and device pairing.
- **Task Manager** — the System Dashboard surface for system activity and control.

Globes may carry decorative depth such as galaxies; that ornament never encodes meaning. A new category surface attaches as another globe without disturbing the globes already present.

## Full-screen view

Opening the Core fills the screen: the Box at the bottom, connection conduits animating up the trunk, and every canopy globe shown with its category label. The filesystem and application graph underneath stays real; a list-and-details mode is available for precision, accessibility, bulk operations, and recovery. Moving a visual node never moves bytes unless the owner invokes an explicit file operation.

## Gauges

The full-screen Core is a customisable instrument surface. The owner places gauges freely around the canopy and lower section, each reading one system metric — processor, memory, storage pressure, network, power, temperature, active applications, background work, top applications by usage, local models, external-provider activity, and pending sync or backup work.

Gauges use the System Dashboard telemetry contract for source, freshness, warning ranges, and safe actions. They never display document contents, prompts, credentials, or private payloads. Placement, size, grouping, visibility, and presets are owner-controlled, and layout corruption never loses data.

## Memory Box

Memory Box is a Linux filesystem reserved strictly for assistant memory, training material, and boot configuration. It is where an assistant is personalised and where it keeps what it learns about the owner.

- One entry per available assistant model. An aggregating provider such as OpenRouter appears as a single entry covering its models, and each entry exposes its boot process.
- Each entry holds the assistant's personality file, its README and boot instructions, and one isolated memory slot. A README guides an assistant after connection; it never grants access or widens a slot.
- Memory Box is the default location where an assistant stores memories and starts projects.
- Contents stay under SHELL custody. Nothing leaves for SHELL Cloud, Tenari storage, SEED, or canonical autobiographical Memory without a separate explicit operation governed by that destination.
- Owner-authored evidence and assistant-authored inference stay distinguishable by provenance. The owner holds inspection, portable export, correction, and complete deletion; an absent or revoked grant fails closed.

SEED is a plugin inside Memory Box: a sealed local corpus with its own capture, curation, retrieval, dataset, backup, and restore behaviour. It is off by default, permission-gated, local-inference only, and never enters cloud sync or implicit integration reach.

## Boundary with Memory Grove

Memory Grove is Tenari's surface for the Companion's canonical autobiographical Memory. It is not a filesystem, is not a globe in the Core, and carries no dependency on the Core. An owner may explicitly export provenance-preserving Memory from the Grove into Memory Box; that export is a separate operation and does not make Memory Box a second autobiographical store.

## Accessibility and recovery

- Every Core action has a keyboard, screen-reader, reduced-motion, high-contrast, list/details, breadcrumb, search, and direct-path equivalent.
- The Core rebuilds from canonical paths and manifests; the visual layout never holds the only copy of anything.
- Broken links, unavailable mounts, permission denial, stale indexes, and backup gaps show as distinct states.
- System recovery stays reachable when providers, SEED, Tenari, the network, or the graphical Core is unavailable.

Implementation sequence lives in `Shell/docs/build-orders/SHELLs-Core.md`. System gauges remain owned by `Shell/docs/surfaces/System-Dashboard.md`. Assistant-slot conformance remains owned by `Shell/docs/build-orders/AI-Memory-Contract.md`. Canonical autobiographical Memory remains owned by `Tenari/memory/memory-grove/Memory-Grove.md`.
