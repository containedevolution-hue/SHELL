# SHELL Node Sidecar

The CouchDB-protocol-compatible HTTP host that runs alongside the Tauri shell.

**Built:**
- The sidecar implemented: one Node process (express + express-pouchdb + PouchDB's Node adapter) on `localhost:5984`, storage under `./data/`, started and killed automatically by Tauri
- An auth model implemented: loopback identifies transport only, not authority; bundled windows exchange a process bootstrap for short-lived caller/scope-bound sessions; PouchDB/Flow/speech/asset routes need a sync credential, MCP uses a separate credential; mutations carry unique request ids and fail closed on replay/expiry/revocation
- Pairing and local-doc routes implemented: `GET /pair` (status only), `GET /local/docs` and `/local/docs/:id` (loopback-only, serving only the most-recently-used store's `doc:*` rows)
- C3 same-network sync implemented: a per-user PouchDB replicates over HTTPS on the LAN after code pairing

**Not built yet:**
- C2c: bundling a Node binary via Tauri's proper sidecar pattern for a shippable executable (currently uses the system Node)
