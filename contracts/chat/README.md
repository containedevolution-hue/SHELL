# Chat Native Desk Protocol v2

Shell's public, portable contract for Chat host observations and native-client desk management (`v2.mjs`). Not a live endpoint — current capabilities must not advertise native desk management until a real compositor/session adapter passes acceptance.

**Built:**
- Protocol v2 defined: one lab slot holding a complete registered native application at a time; attach/detach/open-standalone/reattach operations; no terminate/kill/credential/cookie/arbitrary-command/URL operation exists in the contract
- Trusted local registry v2 schema defined (`native-clients.schema.json`): exact platform identities (Linux: executable plus window class plus `/proc/pid/exe`; Windows: package-family name plus AUMID plus relative executable plus window class); the shipped registry is intentionally empty
- Required policy defined: `preserve-native` — a client occupies the slot only at `capabilityState: native-complete`; Shell must not silently replace a downloaded app with a webpage, iframe, or API recreation
- Troubleshooting design: a reversible isolation path (open app separately, test, reattach), a bounded health report of only observed facts, diagnostic-only classification that never grants repair/reset/terminate/credential access
- Slice 3 implemented: an executable default-off native-client registry, an address-based Hyprland adapter, a serialized one-slot controller, and deterministic tests for registration/matching/switching/parking/standalone/reattach/close/health/reconciliation; a default-off Windows backend covers packaged identity, process/HWND binding, minimize/restore, A-B-A continuity, negative-monitor/mixed-DPI coordinates, and elevated/foreign-desktop denial
- In-process bridge implemented (see `IN-PROCESS-BRIDGE.md`): authenticates a trusted in-process peer, validates native geometry, and revokes on identity/geometry loss

**Not built yet:**
- A completed Chat-to-Tauri transport: canonical Chat launcher, native caller/frame/navigation binding, native layout producer, liveness/geometry callbacks
- Linux/Windows runtime proof: a real Hyprland/Tauri session, downloaded provider apps, multi-monitor behavior, crash recovery, capability-by-capability comparison
- A Windows equivalent of the Linux non-mutating evidence collector, and physical acceptance
