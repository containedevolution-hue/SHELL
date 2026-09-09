# Photos

SHELL's system surface for owner-controlled image and album storage — a sibling of Files, not a portfolio app, because it depends on SHELL's local disk, dedup, and phone-pairing capabilities.

**Built:**
- Ownership decided: Photos owns its album catalog, thumbnails, organization, and image metadata; SHELL capabilities supply store/organize/dedupe/export/access-on-connect (the existing Rust dedup engine supplies the dedupe path); phone pairing grants only explicitly approved image access/transfer scope; Core projects albums by custody without becoming their store
- A provenance rule enforced: uploading, importing, browsing, or analyzing a photo never creates User Memory by itself

**Not built yet:**
- The actual store/organize/dedupe/export/pairing implementation — this document states the contract, not a shipped feature
- General file browsing, cloud quota, assistant memory, Contacts, and SEED explicitly stay out of Photos' ownership
