# Extraction Manifest

What crossed from Tenari's former `localhub/` subtree into SHELL, and the boundary each area must reach — architecture debt, not permission to keep the dependency indefinitely.

**Built:**
- SHELL-owned pieces identified: the local canvas/web assets, Tauri lifecycle and native bridge, local agent (grants, containment, audit, documents, browser control, Flow-local seam), the image dedup engine, Pi/Linux-session setup work, bundled-runtime provisioning, and local test suites
- Legacy Tenari integration seams identified and scoped for isolation: hard-coded Tenari origins, `/api/hub/*` provisioning/pairing/beacon flows, `localhub://` OAuth return behavior, Tenari app-catalog routes, PASS/entitlement/tunnel assumptions, Companion/Guide-specific MCP callers
- An explicit exclusion list set: Tenari Companion/Memory/Stardust/World/economy, Tenari server auth/Postgres/Stripe/membership, canonical CE app implementations, and any copied private Tenari source dependency

**Not built yet:**
- The 6 first decoupling targets: make the Tenari adapter absent by default, replace origin allowlists with owner grants, separate local identity from Tenari pairing, replace the remote catalog with a SHELL app registry, publish versioned schemas across data/files/browser/devices/windows/sync/providers/integrations, and implement the CE app-manifest/host-adapter boundary with Scribble as the first external app
