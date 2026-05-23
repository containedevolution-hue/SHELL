// LocalHub — Cyclone C2a + C2b (memory/apps/Cyclone-LocalHub-Conceptual.md).
//
// Tauri shell that:
//   - Opens a desktop window pointing at the live PWA
//     (https://app.containedevolution.com/) — see tauri.conf.json.
//   - C2b: spawns the Node sidecar (../node-sidecar/index.js) which runs an
//     express-pouchdb host on http://localhost:5984/. The sidecar is the
//     CouchDB-protocol endpoint C3's PouchDB clients will replicate to.
//   - Kills the sidecar on ExitRequested so we never leave a zombie holding
//     port 5984.
//
// Dev:    `npm run dev`   (== `tauri dev`)   — uses *system* Node.
// Build:  `npm run build` (== `tauri build`) — needs C2c's bundled-Node sidecar.
//
// Sidecar script path resolves via env!("CARGO_MANIFEST_DIR"), which is set at
// compile time to /localhub/src-tauri. We go up one to /localhub/ and into
// node-sidecar/. Production builds need a different path-resolver (Tauri's
// resolve_resource) — that's a C2c concern.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command};
use std::sync::Mutex;

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
