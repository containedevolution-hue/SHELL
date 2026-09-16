# Trusted Chat Host Bridge

The Shell-owned in-process attachment boundary for Chat native-desk protocol v2. Executable and deterministically tested — not a wired Tauri IPC transport or an installed Chat launcher yet.

**Built:**
- Bootstrap authority implemented: only trusted native host code constructs the bridge; identity is exact pid/session/compositor address/executable/class, never provider-supplied; `connect(peer)` grants one frozen capability port that can't be replayed, duplicated, or exposed globally
- Trusted geometry path partially implemented: layout carries a native timestamp, window identity, compositor size, CSS viewport, and content rectangle; the resolver expires measurements after one second, rejects clipping/inconsistent scale, and supports negative monitor origins
- Windows backend implemented: a private compiled Rust driver, an authenticated size-bounded inherited pipe to the exact Node child, a random per-launch secret/session, deduplicated request ids, registered client ids only, bounded geometry
- Verification implemented: the full Shell test suite passes, exercising forged peers, revoked/queued calls, close-during-dispatch, stale geometry, negative origins, scaling, provider restart, and pid/HWND recycling

**Not built yet:**
- Native `readLayout()`/`refresh()` wiring so the geometry producer actually runs (currently a remaining native integration gate)
- Loading the reviewed canonical Apps Chat artifact and binding a real native window/webview to it
- Linux packaging, native IPC, crash recovery after full host-process loss, physical multi-monitor/provider comparison
- Canonical Chat caller wiring, mixed-DPI geometry, focus behavior, and live provider comparison on Windows
- General capability discovery; the bundled provider registry remains empty
