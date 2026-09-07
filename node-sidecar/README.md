# SHELL Node Sidecar

The CouchDB-protocol-compatible HTTP host that runs alongside the Tauri shell.
Part of the SHELL local agent — see [`../docs/extraction-manifest.md`](../docs/extraction-manifest.md).

## What it is

- One Node process. `express` + `express-pouchdb` middleware + PouchDB's Node
  adapter (LevelDB-backed, persistent on disk).
- Listens on `http://localhost:5984/` (the CouchDB default port).
- Storage: `./data/` next to this script. One subfolder per PouchDB database.
- Started + killed by Tauri's `src-tauri/src/main.rs` automatically.
- Loopback identifies transport location; it is not mutation authority. The
  bundled Tauri `main` and `flow-hud` windows exchange a process bootstrap for
  short-lived, caller- and scope-bound local sessions. Mutations require a
  unique request id, and replay, expiry, revocation, caller mismatch, or scope
  mismatch fail closed. PouchDB, Flow, speech, and asset requests otherwise need
  the sync-only credential; MCP uses its separate credential. Remote PouchDB
  paths are bound to the paired user.
- `GET /pair` returns status only. Pair through the Railway beacon plus the
  ten-minute local code; legacy shared-token files rotate and require re-pairing.
- `GET /local/docs` and `GET /local/docs/:id` are loopback-only and feed the
  bundled offline shell. The list carries a 200-character snippet; the single
  read carries the whole body. Both serve `doc:*` rows from the most recently
  used store only, so a `mem:*` cloud cache row is never returned as local data.

## Run standalone (dev / verify)

```powershell
cd node-sidecar
npm install     # one-time; pulls express + express-pouchdb + pouchdb-node
node index.js
```

Then in another shell:

```powershell
$env:SHELL_SYNC_TOKEN = node -p "require('./lib/pairing').getSyncToken()"
Invoke-RestMethod http://localhost:5984/ -Headers @{ Authorization = "Bearer $env:SHELL_SYNC_TOKEN" }
```

PouchDB and MCP routes require their respective bearer credentials even on
loopback. Read-only Shell discovery routes remain loopback-only.
The complete route/caller inventory is [local HTTP authentication](../docs/local-http-auth.md).

## Sync status

- **C3 — same-network sync is built.** The PWA's per-user PouchDB
  (`ce-memories-{id}`) replicates over HTTPS on the LAN after code pairing.
- **C2c — bundling.** Today the sidecar uses the *system* Node (which is fine
  for dev on the developer's machine). For a shippable `.exe`, C2c bundles a
  Node binary and runs the sidecar via Tauri's proper "sidecar" pattern.
