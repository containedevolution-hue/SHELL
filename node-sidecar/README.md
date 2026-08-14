# LocalHub Node Sidecar

The CouchDB-protocol-compatible HTTP host that runs alongside the Tauri shell.
Cyclone C2b deliverable — see [`../../memory/apps/System/Tenari-Command-Center.md`](../../memory/apps/System/Tenari-Command-Center.md).

## What it is

- One Node process. `express` + `express-pouchdb` middleware + PouchDB's Node
  adapter (LevelDB-backed, persistent on disk).
- Listens on `http://localhost:5984/` (the CouchDB default port).
- Storage: `./data/` next to this script. One subfolder per PouchDB database.
- Started + killed by Tauri's `src-tauri/src/main.rs` automatically.
- Direct loopback requests are trusted for same-machine desktop use; proxy
  headers or a public Host remove that trust because cloudflared also connects
  to the origin over loopback. Every remote
  PouchDB, Flow, speech, and asset request needs the sync-only capability; MCP
  uses a different capability. Remote PouchDB paths are bound to the paired user.
- `GET /pair` returns status only. Pair through the Railway beacon plus the
  ten-minute local code; legacy shared-token files rotate and require re-pairing.
- `GET /local/docs` and `GET /local/docs/:id` are loopback-only and feed the
  bundled offline shell. The list carries a 200-character snippet; the single
  read carries the whole body. Both serve `doc:*` rows from the most recently
  used store only, so a `mem:*` cloud cache row is never returned as local data.

## Run standalone (dev / verify)

```powershell
cd localhub/node-sidecar
npm install     # one-time; pulls express + express-pouchdb + pouchdb-node
node index.js
```

Then in another shell:

```powershell
curl http://localhost:5984/
# {"couchdb":"Welcome","version":"...","vendor":{"name":"PouchDB-Server"}}
```

## Sync status

- **C3 — same-network sync is built.** The PWA's per-user PouchDB
  (`ce-memories-{id}`) replicates over HTTPS on the LAN after code pairing.
- **C2c — bundling.** Today the sidecar uses the *system* Node (which is fine
  for dev on the developer's machine). For a shippable `.exe`, C2c bundles a
  Node binary and runs the sidecar via Tauri's proper "sidecar" pattern.
