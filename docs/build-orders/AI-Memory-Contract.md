# AI Memory Contract

This order publishes the SHELL contract for local assistant-specific memory slots. SHELL owns the store and permission model; each assistant conforms to the contract, and Tenari's Companion uses the same path natively.

The slots appear in Core Box's Memory Box but remain isolated stores. A project README or other boot instruction may guide an assistant after connection; it never grants access or widens a slot.

## Contract shape

- Define a versioned README and machine-readable interface for slot creation, admission, retrieval, correction, retention, export, and deletion.
- Give each assistant a separate owner-granted slot. A grant identifies the assistant, allowed operations, scope, expiry or revocation behavior, and audit record; it never widens itself.
- Store data locally under SHELL custody. No slot enters SHELL Cloud, Tenari storage, SEED, or canonical autobiographical Memory without a separate explicit operation governed by that destination.
- Require owner-visible inspection, portable export, complete deletion, and fail-closed behavior when a grant is absent or revoked.
- Keep assistant-authored inference and owner-authored evidence distinguishable through provenance.

## Build order

1. Specify the slot schema, assistant identity, provenance, version negotiation, and error model.
2. Specify grants for create, read, append, correct, export, and delete, including revocation and audit behavior.
3. Implement the SHELL-local reference store and prove it never enters cloud or sync payloads.
4. Publish the external README, conformance fixtures, and contract tests for other assistants.
5. Connect Tenari's Companion through the native adapter and prove its slot remains distinct from User Memory and SEED.
6. Prove owner inspection, export round-trip, correction, complete deletion, grant revocation, and assistant isolation.

## Completion

Delete this order when the versioned contract is published, Tenari and an external fixture pass the same conformance suite, and locality, isolation, export, deletion, and revocation have deterministic proof.
