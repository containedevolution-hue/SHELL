# Extraction Manifest

This document identifies what crossed from Tenari's former `localhub/` subtree and the boundary each area must reach. It is current architecture debt, not permission to retain a dependency indefinitely.

## SHELL-owned

- Local canvas and bundled offline web assets in `web/`.
- Tauri application lifecycle and native capability bridge in `src-tauri/`.
- Local agent, file grants, real-path containment, audit feed, local documents, browser control, Flow-local seam, and parent-process lifecycle in `node-sidecar/`.
- Image deduplication in `dedup-engine/`.
- Pi and future Linux-session setup work under `node-sidecar/pi/`.
- Bundled-runtime provisioning in `scripts/`.
- Local typing-trainer and sidecar security/behavior tests.

## Legacy Tenari integration seams

These remain temporarily so the extracted baseline is runnable, but they must move behind a versioned optional integration:

- Hard-coded `app.tenari.world`, `tenari.world`, and development origins.
- `/api/hub/*` provisioning, registration, display-token, pairing, beacon, and certificate flows.
- `localhub://` OAuth return behavior and the production-PWA origin capability.
- Tenari app-catalog routes and the remote handoff in the local canvas.
- PASS/entitlement assumptions, Railway tunnel registration, and Tenari-owned cloud naming.
- Companion/Guide-specific MCP callers and authentication subjects.

## Must not enter SHELL core

- Tenari Companion identity, autobiographical Memory, Stardust billing, OpenRouter funding policy, Tenari World, Moon Rocks, or campaign economy.
- Tenari server authentication, Postgres schemas, Stripe, membership, or account-portal implementation.
- A copied private source dependency on the Tenari repository.

## Test ownership

- Tests already inside this repository protect SHELL behavior directly.
- Tenari retains integration tests for its routes and optional connection behavior.
- Cross-repository contract fixtures must be versioned and runnable from either repository without the other's checkout.
- Real MSI, browser, cloud, recovery, and Brics evidence remains separate from deterministic unit checks.

## First decoupling targets

1. Introduce integration discovery and make the Tenari adapter absent by default.
2. Replace origin allowlists with local-owner grants plus adapter-contributed origins.
3. Separate local identity and permissions from Tenari account pairing.
4. Replace remote catalog assumptions with a SHELL app registry.
5. Publish versioned schemas for data, files, browser, devices, windows, sync, assistant providers, and integrations.
