# Brics I/O CEE OS boundary

Brics I/O is the universal Contained Evolution input/output surface. CEE OS is the sole owner of privileged computer-side input routing and operating-system permission enforcement.

Local Android text entry and app-local controls do not involve CEE OS. A phone controlling a CEE OS computer requires authenticated pairing plus a fresh Brics I/O target session. The adapter consumes the canonical Brics I/O target-session and input-event contracts and publishes bounded output-state updates.

Before accepting an event, the adapter must:

1. validate the contract and reject unknown fields;
2. bind the paired device, surface, target session, and currently focused target;
3. require a live, unexpired, unrevoked grant for the semantic action;
4. reject replayed or out-of-order sequence numbers;
5. translate only an allowlisted semantic action into platform input;
6. stop routing on lock, secure-desktop transitions, focus loss, expiry, revocation, disconnect, or health failure.

Initial capability grants are narrow: `input.text`, `input.pointer`, `input.game`, and explicitly allowlisted shortcuts. A target session carries identifiers and grants but never a credential, pairing secret, shell command, executable payload, or reusable authorization token. Imported profiles grant nothing by themselves.

CEE OS may return labels, focus, availability, progress, connection health, and similar bounded presentation state. It treats phone-provided profiles as untrusted data and treats target output as untrusted presentation data. Neither direction can create a new action or permission.

Vehicle and robot motion controls remain in their target adapters, with their own dead-man behavior, watchdogs, limits, and safe stop. CEE OS input routing cannot stand in for those controls.

This document defines the required boundary; the remote Brics I/O adapter is not implemented yet.
