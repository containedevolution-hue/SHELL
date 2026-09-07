# Trusted Chat host bridge

`node-sidecar/lib/native-desk-bridge.js` implements the Shell-owned in-process
attachment boundary for protocol v2. It is executable and deterministically
tested. It is **not a wired Tauri IPC transport or an installed Chat launcher**.
No production page receives this port, and no HTTP management route exists.

## Bootstrap authority

Only trusted native host code constructs the bridge. It supplies an opaque
`peer` object, an observed `chatIdentity`, the compositor backend, a native
`readLayout` function, Shell's registry, and the installation acceptance result.
The identity includes exact pid, process-start-bound session id, compositor
address, executable, and initial class. None comes from a provider title or
page-supplied launch request.

`connect(peer)` grants one frozen `observe/manage/health` port. A JSON copy,
another object, an old port, or a second connection has no attachment authority.
The peer and bootstrap factory stay in the trusted process. Possession of the
returned port is authority; it must never be published on `window`, an event bus,
an HTTP route, or a global callback. This is object-capability authentication
within one process, not authentication of arbitrary serialized messages.

Each bridge has a fresh random host session. `close(peer)` immediately revokes
new and queued calls, waits for an already dispatched operation, and parks the
exact owned windows. It never stops provider processes or remote execution.
A failed park remains an error and trusted close can be retried. Reopening Chat
requires a new native identity check and bridge; old request/session authority
cannot be reused.

## Trusted geometry path

The native host supplies `readLayout()` on every observation/action and invokes
`refresh(peer)` from native move, resize, monitor, visibility, navigation,
process-liveness, and watchdog handling. The module does not secretly install
a watcher. Wiring these callbacks is a remaining native integration gate.

The layout contains a native timestamp, window/session identity, compositor
size at measurement, CSS viewport dimensions, and the reserved content rectangle.
`contentMatchesWindow: true` is a trusted native assertion requiring measured
proof that the undecorated content viewport corresponds to the compositor frame.
A page's claim alone is insufficient. Native bootstrap must derive/check this
assertion, frame, and layout revision; it cannot simply forward arbitrary DOM
measurements. Until that producer is implemented and exercised, do not enable a
production slot.

The resolver matches the current compositor window identity and frame size,
expires measurements after one second, rejects clipping and inconsistent scales,
and maps CSS edges into compositor logical coordinates. Negative monitor origins
are supported. Fractional resulting edges are refused pending an exercised
rounding policy. The ordinary workspace id comes from compositor inventory;
holding/standalone workspace names are Shell constants. `manage` accepts neither
geometry, paths, arbitrary commands, nor acceptance flags.

A changed slot first parks the previous overlay and verifies that parking before
adopting the new coordinates. Reattachment is explicit; the manager does not
stretch an unverified overlay during resize. Missing/stale geometry or changed
Chat process identity revokes the port and attempts verified parking. Provider
restart cannot be acknowledged as Return to Lab for the previous managed
session: an explicit attach is required.

## Tauri integration still required

The present Tauri app launches Shell's local app store; Chat has no reviewed
installed release or native window registration there. Do not grant its existing
main, Flow, provider, remote Tenari, or arbitrary browser surfaces this bridge.

The next native integration must load the reviewed canonical Apps Chat artifact,
bind a native window/webview identity and allowed local document to its lifetime,
authenticate every IPC caller in Rust (including frame/navigation boundaries),
and carry the narrow port over private inherited pipes or an equivalently
authenticated native channel. Registration and geometry authority must remain
native-only. Revoke on navigation, destruction, and process loss; implement the
native geometry/liveness callbacks described above. A loopback token placed in a
URL, window title, or page storage is not this boundary.

Linux packaging, native IPC, the geometry producer, crash recovery after loss of
the entire host process, and physical multi-monitor/provider comparisons remain
unproven. General capability discovery remains planned, and the bundled provider
registry remains empty. See [the test-session procedure](../../os/CHAT-HYPRLAND-TEST.md).

## Verification boundary

The Windows continuation passed all 88 Shell repository tests and the Apps
repository suite. The Windows Tauri release binary and NSIS installer build also
passed. Changed-document local links resolve. The new tests exercise forged peer
objects, revoked/queued calls, close during dispatch, stale/native-frame geometry,
negative origins, exact scaling, provider restart, lost-switch reconciliation,
pid recycling, launch failure, and unavailable evidence collection. These are
deterministic/Windows build results, not a Linux desktop runtime or provider
capability acceptance record.
