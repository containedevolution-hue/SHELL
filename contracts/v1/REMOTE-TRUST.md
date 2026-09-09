# Shell Remote Trust Contracts v1

The trust evidence Shell must publish before a remote Chat surface can invoke a Shell-owned capability. Publishes schemas and policy only — no network route, pairing, or remote runtime yet.

**Built:**
- Four schema records defined: remote-session (an authenticated, expiring, revocable device session), live-capability (fresh evidence for one capability/session), permission-decision (an authenticated allow/deny/revocation bound to session, capability, grant, and effect), authenticated-receipt (a terminal or uncertain outcome bound to the request, idempotency key, grant, and sessions)
- A fail-closed reference policy (`remote-trust.mjs`) implemented: authorization requires an active session, an exact target match, fresh "available" evidence, and an unexpired explicit allow decision; missing or unknown data denies execution
- An idempotency rule defined: single-use keys, verified-completed receipts replay without redispatch, changed-fact reuse is rejected, and uncertain receipts require fresh reconciliation before continuing
- Phone modeled as a subject kind, not a trust level — no ambient capability from pairing alone

**Not built yet:**
- Pairing, transport, credential storage, and cross-platform phone-control adapters
- Separate hardware acceptance evidence for Windows, macOS, and Linux before Shell reports any of this available
