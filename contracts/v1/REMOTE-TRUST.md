# Shell remote trust contracts v1

These contracts define the trust evidence Shell must publish before a remote Chat surface can invoke a Shell-owned capability. They do not create a network route, pair a phone, grant a permission, or advertise a remote runtime.

The four independent records are:

- `remote-session.schema.json`: an authenticated, expiring, revocable device session bound to one exact host runtime session;
- `live-capability.schema.json`: fresh Shell-owned evidence for one versioned capability and that exact host runtime session;
- `permission-decision.schema.json`: an authenticated allow, deny, or revocation bound to the device session, host session, capability identity, grant, and effect class;
- `authenticated-receipt.schema.json`: an authenticated terminal or uncertain outcome bound to the request, correlation, idempotency key, grant, device session, host session, and capability identity.

`remote-trust.mjs` is the portable fail-closed reference policy. The Shell host must supply cryptographic authentication verification; a record cannot declare itself verified. Authorization requires an active unexpired session, an exact target/session match, fresh `available` evidence with every required check equal to `yes`, and an unexpired explicit `allow` decision for the same subject, grant, capability, and effect. Missing or unknown data denies execution.

Phone is a subject kind, not a trust level. A paired phone receives no ambient capability. Changing the selected host, replacing either session, disconnecting, expiring, or revoking invalidates the authorization chain.

Idempotency keys are single-use bindings. A verified completed receipt is replayed without redispatch. Reuse with different request facts is rejected. An `uncertain` receipt requires fresh host reconciliation and a new authoritative receipt before mutation may continue; it is never silently retried.

## Runtime status

This release publishes schemas, policy semantics, and deterministic tests only. It does not implement pairing, transport, credential storage, cross-platform adapters, or phone control. The existing legacy Tenari pairing adapter is not an implementation of this contract. Windows, macOS, and Linux support must each earn separate hardware acceptance evidence before Shell reports it available.
