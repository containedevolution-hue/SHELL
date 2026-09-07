# Local HTTP authentication

Loopback is a transport boundary, not caller authentication. Shell applies these authorities to the sidecar:

| Surface | Read or mutation authority | Current first-party caller |
| --- | --- | --- |
| `/v1/capabilities`, `/v1/apps`, `/local/docs`, `/access/state`, `/access/browse`, `/access/audit`, `/access/trash` | loopback-only read | bundled Shell surfaces |
| `/access/folders`, `/access/folders/write`, `/access/websites`, `/access/trash/restore` | `access.mutate` local session | bundled `main` window; no settings UI is shipped yet |
| `/v1/app-store/:id/install` | `app-store.install` local session, or expiring single-use grant returned to the standalone browser surface | bundled `main` window or `start:apps` browser surface |
| `/flow`, `/speak`, `/asset-forge` | paired sync credential, or `sync.invoke` local session | exact bundled `flow-hud` window; legacy paired client where supported |
| `/mcp` | paired MCP credential | configured MCP client and documented appliance verification command |
| PouchDB-compatible root | paired sync credential, then paired database binding for non-loopback callers | legacy paired synchronization client |
| `/pair/confirm` | pairing identity credential | legacy provider pairing flow when explicitly enabled |
| `/v1/pairing-management` mutations | `pairing.manage` local session | exact bundled `main` window |

Tauri generates a random bootstrap for each desktop process and passes it directly to its child sidecar. Only the exact bundled `main` and `flow-hud` window labels at a Tauri asset origin can request that bootstrap. The sidecar exchanges it for a five-minute, caller- and scope-bound session. Every local mutation carries a unique request id; replay, wrong caller, wrong scope, expiry, and revocation fail closed. The bootstrap and local sessions are never written to disk or logged.

An installed app opened from the loopback app host, a provider page, another Tauri window, and an arbitrary local process cannot invoke the bootstrap command. Flow pins authenticated local requests to `127.0.0.1:5984`; event data cannot redirect its credential.

This migration does not expose phone or remote execution. Pairing credentials remain the legacy optional integration boundary and should be rotated through pairing if disclosed.
