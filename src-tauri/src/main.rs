// LocalHub — Cyclone C2a + C2b + C2.1a (memory/apps/Cyclone-LocalHub-Conceptual.md).
//
// Tauri shell that:
//   - Opens a desktop window pointing at the live PWA
//     (https://app.containedevolution.com/) — see tauri.conf.json.
//   - C2b: spawns the Node sidecar (../node-sidecar/index.js) which runs an
//     express-pouchdb host on http://localhost:5984/. The sidecar is the
//     CouchDB-protocol endpoint C3's PouchDB clients replicate to.
//   - C2.1a: registers the `localhub://` custom protocol via the deep-link
//     plugin so Google's OAuth callback can return into this app from the
//     user's system browser. single-instance ensures the callback URL hits
//     the EXISTING Tauri process (a fresh instance would defeat the point —
//     the in-flight PWA login would never see the code).
//   - Kills the sidecar on ExitRequested so we never leave a zombie holding
//     port 5984.
//
// Dev:    `npm run dev`   (== `tauri dev`)   — uses *system* Node.
// Build:  `npm run build` (== `tauri build`) — needs C2c's bundled-Node sidecar.
//
// Sidecar script path resolves via env!("CARGO_MANIFEST_DIR"), which is set at
// compile time to /localhub/src-tauri. Production builds need a different
// path-resolver (Tauri's resolve_resource) — that's a C2c concern.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;

fn spawn_sidecar() -> std::io::Result<Child> {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let script = std::path::PathBuf::from(manifest_dir)
        .parent()
        .expect("src-tauri must have a parent dir (localhub/)")
        .join("node-sidecar")
        .join("index.js");
    println!("[localhub] spawning sidecar: node {}", script.display());
    Command::new("node").arg(&script).spawn()
}

fn main() {
    let sidecar = match spawn_sidecar() {
        Ok(child) => {
            println!("[localhub] sidecar pid: {}", child.id());
            Some(child)
        }
        Err(e) => {
            eprintln!(
                "[localhub] WARN: failed to spawn sidecar ({}). The desktop \
                 shell will still open, but http://localhost:5984/ won't be \
                 available. Verify Node is on PATH and node-sidecar/ deps are \
                 installed (`cd node-sidecar && npm install`).",
                e
            );
            None
        }
    };
    let sidecar_state: Mutex<Option<Child>> = Mutex::new(sidecar);

    let app = tauri::Builder::default()
        // C2.1a — single-instance MUST be registered before deep-link so a
        // second `start localhub://...` invocation forwards its args to the
        // running process instead of spawning a fresh Tauri shell. The
        // callback fires in the existing instance; deep-link's on_open_url
        // (below) sees the URL via the same plugin pipeline.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            println!("[localhub] single-instance trigger: {:?}", args);
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            // On Linux + Windows-dev, the deep-link plugin can register the
            // `localhub://` scheme in the OS at runtime. macOS reads it from
            // Info.plist (bundled). Production Windows registration is the
            // MSI installer's job — that's C2c.
            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            {
                let _ = app.deep_link().register_all();
            }

            app.deep_link().on_open_url(|event| {
                let urls: Vec<String> =
                    event.urls().iter().map(|u| u.to_string()).collect();
                println!("[localhub] deep-link received: {:?}", urls);
                // C2.1b will forward this URL into the webview as an event so
                // the PWA's OAuth-callback handler can exchange the code +
                // complete the login.
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(move |_handle, event| {
        if let tauri::RunEvent::ExitRequested { .. } = event {
            if let Ok(mut guard) = sidecar_state.lock() {
                if let Some(mut child) = guard.take() {
                    println!("[localhub] killing sidecar pid: {}", child.id());
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        }
    });
}
