# Chat native desk protocol v2

`v2.mjs` is Shell's public, portable contract for Chat host observations and complete native-client desk management. Consumers may vendor its exact bytes pinned to a Shell Git commit and SHA-256. Shell owns this source. It is not a live endpoint; current capabilities must not advertise native desk management until a real compositor/session adapter passes the acceptance gates below.

Identifier: `com.containedevolution.shell.chat`, integer version `2`. Version 1 was deleted before launch because its browser/contained route model contradicted the accepted native-client lab. Git preserves that history; no current contract supports or recommends the retired concept.

## One lab slot, complete applications

Chat owns the lab, its desk bubbles, default selection, surrounding controls, and troubleshooting presentation. Shell owns application discovery, process and window identity, the reserved native window slot, placement, focus, parking, restoration, permissions, and compositor integration. Hyprland is the first Linux compositor target; it manages top-level surfaces and does not turn provider applications into Chat HTML children.

A configured desk identifies a Shell-registered `clientId`, never an executable path supplied by webpage content. `attach` starts the registered application when necessary or reacquires its existing native window, atomically parks the previously active client, and places the requested complete application in the lab slot. `detach` parks the client without terminating it. `open-standalone` moves the same native session to an ordinary visible workspace for an isolation check. `reattach` returns that same session to the lab. Closing Chat detaches managed windows and leaves their applications running. The protocol deliberately contains no terminate, kill, credential, cookie, arbitrary command, or arbitrary URL operation.

`native-clients.schema.json` defines Shell's trusted local registry v2. Each client carries only platform identities that separately passed capability comparison. Linux requires an absolute executable, exact initial-window classes, and exact `/proc/<pid>/exe` targets. Windows requires a stable package-family name, application user model id, package-relative executable, and exact top-level window class; package versions and versioned `WindowsApps` paths are deliberately excluded from registration identity. Mutable window titles are never identity. The shipped registry is intentionally empty: installed-app discovery does not promote a provider into production acceptance.

The required policy is `preserve-native`. A client may occupy the slot only with `capabilityState: native-complete`. Shell must not silently replace a downloaded application with a provider webpage, iframe, API recreation, different account, or newly created conversation. When the required native client or capability cannot be preserved, attachment fails visibly and Chat offers the ordinary standalone application path.

## Troubleshooting

Every managed desk exposes the reversible isolation path: open the exact application separately, let the user test the disputed capability in its original surface, then reattach the same native session. A bounded health report may state only what Shell actually observes: application discovery, process state, slot attachment, Shell permissions, and remote-session continuity. Account identity or provider capability is `unknown` unless an authorized provider boundary supplies it.

Chat may interpret the user's comparison as follows: working standalone indicates a Chat/Shell window-management fault; failing standalone indicates a provider application, account, permission, or connection fault; launch failure indicates installation/discovery trouble; wrong account or conversation indicates session routing. This classification is diagnostic guidance, not permission to repair, reset, terminate, clear data, or collect credentials.

## Host attachment and continuity

A trusted local host implements `observe()`, `manage(request)`, optional `health(request)`, and optional `contribute(context)`. No query parameter, provider page, iframe, arbitrary global callback, or unauthenticated message attaches it. Observations expire within five minutes. Timeout after a dispatched management request is an unknown outcome and must be reconciled from a fresh observation before retrying.

Remote identifiers remain observations, not credentials or commands. Switching, parking, opening standalone, reattaching, closing Chat, or detaching the adapter never terminates remote execution. No remote-stop operation exists in this contract.

## Acceptance gates

- Only a registered native client can be attached; provider URLs and executable paths never cross this boundary.
- At most one client is attached to the lab slot; switching parks the former client without process termination.
- Attach and reattach acknowledgements prove the exact desk, client, native session, window, and `native-complete` capability state.
- Close/detach and Chat shutdown leave provider processes and remote work alive.
- Standalone isolation and reattachment preserve the same native session and window identity.
- A degraded or unknown-capability client cannot occupy the slot.
- Unknown dispatch is reconciled before another state-changing request.
- A real Hyprland/Tauri session, downloaded provider applications, multi-monitor behavior, crash recovery, and capability-by-capability comparison must pass before Shell advertises this manager as available.

## Slice 3 implementation status

Shell now contains an executable, default-off native-client registry, address-based Hyprland adapter, and serialized one-slot controller. Deterministic tests cover trusted registration, exact process/window matching, registered launch, switching and parking, same-session standalone/reattach, Chat-close parking without termination, bounded health facts, idempotency, and reconciliation after an uncertain compositor result. The Linux adapter supports only the explicitly selected Hyprland `0.55.x` legacy command profile and refuses other versions rather than guessing across compositor command changes. A default-off Windows backend additionally covers packaged identity, process-start/HWND binding, package-version-independent paths, recoverable minimize/restore, exact A-B-A continuity, negative-monitor/mixed-DPI coordinates, elevated/foreign-desktop denial, and lost-reply reconciliation through a fake native driver.

No network endpoint is mounted. `native-desk-bridge.js` now authenticates a trusted in-process peer by object identity and supplies the bounded service port. Its native geometry validator binds the exact Chat process/window, rejects stale or clipped measurements, supports negative logical monitor origins, and parks before changing slot geometry. Close revokes queued authority and waits for dispatched work before verified parking. Controller tests also cover provider restart identity, global uncertain-result blocking, and observation ordering. The empty registry is included in Tauri resources.

This is not a completed Chat-to-Tauri transport. Windows now compiles and fake-tests a private Rust driver, but its production port is deliberately disconnected. The canonical Chat launcher, authenticated Rust-to-Node caller/frame/navigation transport, native layout producer, liveness/geometry callbacks, and Linux/Windows runtime proof remain pending. See [the bridge boundary and integration requirements](IN-PROCESS-BRIDGE.md). Production remains unavailable and the registry remains empty. The [separate test-session procedure](../../os/CHAT-HYPRLAND-TEST.md) supplies Linux evidence collection; Windows still needs an equivalent non-mutating collector and physical acceptance. Public `v2.mjs` is unchanged, so consumer pins need no update.
