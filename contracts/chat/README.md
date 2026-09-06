# Chat host protocol v1

`v1.mjs` is Shell's public, portable contract for Chat host observations, surface contributions, and launch acknowledgements. Consumers may vendor its exact bytes pinned to a Shell Git commit and SHA-256. Shell owns this source. It is not a live sidecar endpoint; existing capabilities must not advertise these operations as available yet.

Identifier: `com.containedevolution.shell.chat`, integer version `1`. Exports: `validateSnapshot`, `validateContext`, `validateLaunchAck`, and route constants. Breaking wire changes require a new major version.

## Local host adapter

A trusted local host constructs an adapter implementing `observe()`, `launch(request)`, and optional `contribute(context)`. No browser query parameter, arbitrary global callback, provider iframe, or unauthenticated postMessage attaches an adapter. The adapter owns authentication, origin checks, user gestures, permissions, and explicit native-session selection. This portable module checks wire data only. Standalone Chat can operate with no adapter.

`observe()` returns host identity, a process-specific `hostSessionId`, `observedAt`, `expiresAt`, optional Status Bar presentation, aggregate connection observations, supported `launchRoutes`, and an optional opaque remote `sessionId` with target label and observed state. Observations expire within five minutes and must be refreshed; absent, expired, malformed, or mismatched identity becomes unavailable. A reconnect to a new host session requires a new trusted attachment. Counts and status must not be inferred from Chat's saved subscription shortcuts.

`contribute(context)` accepts only Chat's `appId`, `view` (home, desk, seed), optional opaque desk id, and a short title. These are suggestions for the active surface. Core chooses whether and how they appear in the Status Bar. Contributions are not system truth, permission changes, colors, HTML, or scripts.

`launch(request)` accepts a unique `requestId`, the expected `hostSessionId`, `deskId`, a validated public HTTPS provider `url`, and `returnTo: { appId: 'chat', view: 'home', deskId }`. The native host validates the provider and route again, then returns a matching opened acknowledgement with the exact URL and selected supported route. No provider credentials cross the boundary. The host maps `returnTo` to its installed Chat identity; it must not treat it as an arbitrary redirect or make a second app copy.

Timeout after dispatch means the result is unknown. Chat must not retry or switch to a second route automatically because the first launch may have succeeded. The host retains request idempotency for its session. Unsupported capability before dispatch may use the regular external-browser route. Route support must be proven per provider and platform before being advertised.

## Continuity and receiving

Remote session identifiers are observations, not connection credentials or commands. Chat desk navigation, contribution changes, or adapter detachment never terminates remote execution. No remote-stop operation is in this contract. A new device still needs the normal Shell pairing and grant flow before it can observe a session.

Seed uses its own `com.containedevolution.seed.chat` export protocol. Shell must authenticate and grant-check any eventual Seed bridge, preserve idempotency and event ordering, stage selected files safely, and forward Seed-owned verification receipts. No receiving, filesystem mount, or corpus access is enabled by this host protocol.

Live native, Android, Tenari, and standalone transport integrations remain to be implemented and tested. The contract supports their shared app identity without claiming automatic cookie sharing, device sync, or successful provider embedding.
