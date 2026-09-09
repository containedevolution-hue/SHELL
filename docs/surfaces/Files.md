# Storage

Storage is SHELL's catalog and control plane for user-owned files and document-like data; it works locally with no account. Photos is its sibling surface for albums.

**Built:**
- A two-place model implemented: optional SHELL Cloud (account/encryption/quota-bound) vs. This device (browser/local, not yet promoted to cloud); Storage holds files only — canonical Memory stays with Tenari's Memory Grove, and app-owned records stay canonical in their apps
- A provenance rule enforced: reading or analyzing an upload never creates User Memory by itself; an explicit remember request routes through the normal evidence/Ripening/admission path with file provenance
- Current capabilities shipped: place/folder navigation with URL-addressable views, search/filter/list-grid, cloud usage display, uploads, local document creation, scanning, cloud-plus-local Scribble ownership without flattening rich documents, owner-scoped extraction and bounded AI analysis of explicitly selected content, an openable Generated Media cloud folder, and recoverable cross-place moves

**Not built yet:**
- Decide and build per-user content encryption for uploaded files/media, including migration and proven deletion/backup
- Move file bytes out of Postgres into object storage
- Close the manifest inventory across every user-data domain before claiming "all Tenari data is in Storage"
