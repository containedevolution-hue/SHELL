# LocalHub — Cyclone C2

The desktop half of [Cyclone](../memory/apps/Cyclone-LocalHub-Conceptual.md). A
Tauri (Rust shell) desktop app that:

1. **Loads the live CE PWA** in a desktop window (so the desktop is a full
   counterpart to the mobile app from day one — same codebase, same features).
2. **Hosts a CouchDB-compatible engine** as a Node sidecar (`express-pouchdb` —
   the v1 host engine), so the user's devices on the LAN sync to *their own
   machine*. **[C2b — not yet built.]**
3. **Runs the cron jobs** locally when LocalHub is open. **[Later.]**
4. **Maintains a persistent agent tunnel** to Railway (paid tier) so the phone
   can command + sync from anywhere. **[C6 — paid feature, not yet built.]**

## C2 slicing

- ✅ **C2a — Tauri shell.** *(This commit.)* Opens a desktop window pointing at
  `https://app.containedevolution.com/`. No sidecar. Verifies the desktop
  wrapper works end-to-end. Bundling is OFF (`bundle.active: false`) so dev
  mode works without icons; C2c adds icons + the Windows installer config.
- ❌ **C2b — Node sidecar + express-pouchdb.** Embed a Node sidecar that runs
  `express-pouchdb` as a CouchDB-protocol host on `http://localhost:5984` so
  PouchDB clients can replicate to it (LAN sync in C3 will point them here).
- ❌ **C2c — Windows installer + icons + marketing download stub.** Tauri MSI
  bundling, real icons (32/128/256/256@2x + Windows ICO), `app/download` page.

## Dev (requires the prerequisites below)

```powershell
cd localhub
npm run dev          # == tauri dev
# A desktop window opens onto https://app.containedevolution.com/
```

## Build

```powershell
cd localhub
npm run build        # == tauri build
# C2c enables bundling; until then this is a compile-only smoke test.
```

## Prerequisites (Windows)

- **Node** (already on this dev machine).
- **Tauri CLI 2.x** (already installed globally via npm; `npx @tauri-apps/cli --version` confirms).
- **Rust** — `winget install Rustlang.Rustup -e` then a fresh shell + `rustup default stable-x86_64-pc-windows-msvc`.
- **MSVC Build Tools** — `winget install Microsoft.VisualStudio.2022.BuildTools -e --override "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"`. WebView2 is pre-installed on Win11.

## Layout

```
localhub/
├── README.md            (this file)
├── package.json         (npm scripts wrap the Tauri CLI)
├── web/
│   └── index.html       (frontendDist target — never actually shown; the window
│                         opens straight at the remote PWA URL. Tauri needs *some*
│                         frontendDist to point at.)
└── src-tauri/
    ├── Cargo.toml
    ├── build.rs
    ├── tauri.conf.json  (window opens https://app.containedevolution.com/)
    ├── capabilities/
    │   └── default.json (Tauri 2 capability — main window, core defaults)
    └── src/
        └── main.rs      (thin: `tauri::Builder::default().run(...)`)
```

## Why a separate folder, same repo

Per `CLAUDE.md` doctrine ("One repo. `ce-team` is the unified app. All code
lives here.") + the C0 decision in the Cyclone spec doc: LocalHub lives in a
subfolder so it can share types/protocol code with the server when C3+ wires
the sync layer, without the cross-repo pain we hit with `beta-team`. Split out
to its own repo *only* if the desktop toolchain ever genuinely fights the
server build — which it doesn't today.
