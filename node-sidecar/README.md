# LocalHub Node Sidecar

The CouchDB-protocol-compatible HTTP host that runs alongside the Tauri shell.
Cyclone C2b deliverable — see [`../../memory/apps/Cyclone-LocalHub-Conceptual.md`](../../memory/apps/Cyclone-LocalHub-Conceptual.md).

## What it is

- One Node process. `express` + `express-pouchdb` middleware + PouchDB's Node
  adapter (LevelDB-backed, persistent on disk).
- Listens on `http://localhost:5984/` (the CouchDB default port).
- Storage: `./data/` next to this script. One subfolder per PouchDB database.
- Started + killed by Tauri's `src-tauri/src/main.rs` automatically.

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

## What's next

- **C3 — same-network sync.** The PWA's per-user PouchDB (`ce-memories-{id}`)
  begins replicating to a database here over the LAN, gated by the QR pairing
  flow.
- **C2c — bundling.** Today the sidecar uses the *system* Node (which is fine
  for dev on the developer's machine). For a shippable `.exe`, C2c bundles a
  Node binary and runs the sidecar via Tauri's proper "sidecar" pattern.
