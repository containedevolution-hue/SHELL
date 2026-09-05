# Storage

Storage is SHELL's catalog and control plane for user-owned files and document-like data. It works locally with no account and shows where something lives without replacing the app that owns it.

Photos is its sibling SHELL system surface and owns album-specific catalog and thumbnail behavior (`Photos.md`).

## Contract

Storage has three user-facing places:

- **Cloud** — optional SHELL Cloud files and generated media subject to its account, encryption, and quota contract.
- **This device** — browser/local or paired-SHELL data that has not been promoted to cloud.
- **Memory Tree** — a doorway into canonical User Memory, not a file folder or duplicate memory store.

App-owned records remain canonical in their owning apps. Storage exposes a typed manifest, location, availability, and open/download actions rather than copying app truth into a second database.

External uploads retain provenance. Reading or analyzing an upload does not create User Memory. When the user explicitly asks to remember something from a file, extracted claims enter the normal Memory evidence/Ripening/admission path with file provenance.

The Companion or another integration may operate Storage through granted SHELL capabilities. Tool access does not widen file permissions, create Tenari Memory automatically, or make binary content trusted instructions.

## Current capabilities

- Place and folder navigation with URL-addressable views and device/back parity.
- Search, type filtering, list/grid presentation, cloud usage, uploads, local document creation, and scanning.
- Cloud and local Scribble ownership without flattening rich documents into Storage-only records.
- Owner-scoped extraction from supported text-like uploads and bounded AI analysis of explicitly selected content.
- Generated Media is an openable Cloud folder: its images and videos can be previewed and downloaded from Storage.
- Cross-place moves preserve canonical ownership and remain recoverable when the destination cannot complete.

## Limits

- Storage inspection never grants Memory admission or action authority.
- Image-only documents require OCR before their text can be analyzed.
- Generated Media and other system folders remain organizational views, not new ownership domains.
- Do not claim all Tenari data is in Storage until the manifest inventory covers every user-data domain.

## Next Builds

1. (#29/#79) Decide whether uploaded files/media need the per-user content-encryption model; if yes, define encrypted storage + migration, prove deletion + backup.
2. (#59/#87) Move file bytes out of Postgres to object storage.
3. Close the manifest inventory over every user-data domain before claiming "all Tenari data is in Storage".
