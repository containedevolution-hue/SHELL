# Photos

Photos is SHELL's system surface for owner-controlled image and album storage. It is a sibling of Files, not a Contained Evolution portfolio app, because its core behavior depends on SHELL's local disk, deduplication, and phone-to-computer pairing capabilities.

## Contract

- Photos owns its album catalog, thumbnails, organization, and image-specific metadata.
- SHELL capabilities provide store, organize, deduplicate, export, and access-on-connect operations. The existing Rust deduplication component supplies the dedupe path.
- Phone pairing grants only the explicitly approved image access and transfer scope.
- The Memory Tree projects albums by custody without becoming their store.
- Uploading, importing, browsing, or analyzing a photo never creates User Memory. A deliberate request to remember something uses the ordinary Memory admission path with provenance.

## Limits

- Photos does not own general file browsing, cloud quota, assistant memory, Contacts, or SEED.
- An assistant needs an explicit SHELL capability grant to inspect or act on an image.
