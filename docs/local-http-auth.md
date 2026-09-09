# Local HTTP Authentication

Loopback is a transport boundary, not caller authentication — the authority model the sidecar actually enforces per route.

**Built:**
- A per-route authority table implemented: read-only loopback routes vs. `access.mutate`/`app-store.install`/`sync.invoke`/paired-MCP-credential/paired-sync-credential/pairing-identity-credential/`pairing.manage` gated routes, each mapped to its current first-party caller
- A Tauri bootstrap exchange implemented: a random per-process bootstrap passed only to the exact bundled `main`/`flow-hud` window labels, exchanged for a five-minute caller- and scope-bound session; every mutation carries a unique request id; replay, wrong-caller, wrong-scope, expiry, and revocation fail closed; the bootstrap and sessions are never persisted to disk or logged
- Isolation proven: an app opened from the loopback host, a provider page, another Tauri window, or an arbitrary local process cannot invoke the bootstrap; Flow pins requests to the exact local port

**Not built yet:**
None — this describes the implemented current auth boundary; remote/phone execution is explicitly out of scope here (see the pairing docs).
