// LocalHub — Cyclone C2a + C2b + C2.1a + C2.1b
// (memory/apps/Cyclone-LocalHub-Conceptual.md).
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
//     the EXISTING Tauri process.
//   - C2.1b: forwards the deep-link URL into the webview as an `oauth-callback`
//     event so the PWA can read `?code=&state=` and complete the login. Also
//     loads tauri-plugin-opener so the PWA can call
//     `window.__TAURI__.opener.openUrl(...)` to launch the OAuth URL in the
//     user's system browser.
//   - Kills the sidecar on ExitRequested so we never leave a zombie holding
//     port 5984.
//
// Dev:    `npm run dev`   (== `tauri dev`)   — uses *system* Node.
// Build:  `npm run build` (== `tauri build`) — needs C2c's bundled-Node sidecar.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem, Submenu};
use tauri::{Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;

/// Tauri command — perceptual image-dedup over a local folder, run by the
/// CE-owned `ce_dedup` engine (no third-party product). `threshold` is the
/// hamming cutoff for "same photo"; defaults to ce_dedup::DEFAULT_THRESHOLD.
/// Returns a ScanReport (duplicate groups + reclaimable bytes) or an error
/// string. NOTE: the in-app UI wiring + remote-origin IPC allowance are the
/// deferred integration step — this is the engine's reachable entry point.
#[tauri::command]
async fn scan_duplicates(
    path: String,
    threshold: Option<u32>,
) -> Result<ce_dedup::ScanReport, String> {
    // CPU-bound (decode + hash). Run off the UI thread via spawn_blocking so the
    // window stays responsive instead of going "Not Responding" during a scan.
    tauri::async_runtime::spawn_blocking(move || {
        let root = std::path::PathBuf::from(&path);
        ce_dedup::scan(&root, threshold.unwrap_or(ce_dedup::DEFAULT_THRESHOLD))
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("scan task failed: {e}"))?
}

/// Result of a mass-delete: how many made it to the Recycle Bin, and a
/// per-file reason for any that didn't.
#[derive(serde::Serialize)]
struct DeleteResult {
    deleted: usize,
    failed: Vec<String>,
}

/// Tauri command — send a selection of files to the OS Recycle Bin (recoverable;
/// the user picked Recycle Bin over permanent delete). One bad path doesn't
/// abort the batch — each failure is collected and reported back so the UI can
/// show what survived.
#[tauri::command]
async fn delete_to_trash(paths: Vec<String>) -> DeleteResult {
    // Off the UI thread too — a large selection shouldn't freeze the window.
    tauri::async_runtime::spawn_blocking(move || {
        let mut deleted = 0usize;
        let mut failed = Vec::new();
        for p in &paths {
            // Windows shell delete wants backslashes; a typed "C:/.../x.jpg" path
            // makes it mis-report. Normalize before trashing.
            let normalized = p.replace('/', "\\");
            let path = std::path::Path::new(&normalized);
            if !path.exists() {
                // Already gone (e.g. selected twice) — nothing to fail on.
                deleted += 1;
                continue;
            }
            let res = trash::delete(path);
            // Trust the disk, not the return code: the Windows shell can return a
            // spurious "not found" even when the move to the Recycle Bin worked.
            if !path.exists() {
                deleted += 1;
            } else {
                let why = match res {
                    Ok(()) => "file still present after delete".to_string(),
                    Err(e) => e.to_string(),
                };
                failed.push(format!("{p}: {why}"));
            }
        }
        DeleteResult { deleted, failed }
    })
    .await
    .unwrap_or(DeleteResult {
        deleted: 0,
        failed: vec!["delete task failed to run".into()],
    })
}

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
        // single-instance MUST be registered before deep-link so a second
        // `start localhub://...` invocation forwards its args to the running
        // process instead of spawning a fresh Tauri shell.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            println!("[localhub] single-instance trigger: {:?}", args);
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![scan_duplicates, delete_to_trash])
        .setup(|app| {
            // Tools → "Photo Duplicates" opens the local dedup tool window — a
            // bundled local page (dedup.html), created hidden at launch in
            // tauri.conf.json and shown on demand. Local origin = it can call
            // scan_duplicates / delete_to_trash directly (capabilities/dedup.json).
            let open_dedup =
                MenuItem::with_id(app, "open_dedup", "Photo Duplicates", true, None::<&str>)?;
            let tools = Submenu::with_items(app, "Tools", true, &[&open_dedup])?;
            let menu = Menu::with_items(app, &[&tools])?;
            app.set_menu(menu)?;
            app.on_menu_event(|app_handle, event| {
                if event.id().0.as_str() == "open_dedup" {
                    if let Some(w) = app_handle.get_webview_window("dedup") {
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                }
            });

            // On Linux + Windows-dev, the deep-link plugin can register the
            // `localhub://` scheme in the OS at runtime. macOS reads it from
            // Info.plist (bundled). Production Windows registration is the
            // MSI installer's job — that's C2c.
            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            {
                let _ = app.deep_link().register_all();
            }

            // C2.1b — when a deep-link URL arrives, forward it to the main
            // webview as an `oauth-callback` event. The PWA's login script
            // listens for this and extracts ?code=&state= to complete the
            // OAuth exchange with the server. Capturing the AppHandle is
            // required for emit from inside the 'static closure.
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                let urls: Vec<String> =
                    event.urls().iter().map(|u| u.to_string()).collect();
                println!("[localhub] deep-link received: {:?}", urls);
                if let Some(window) = handle.get_webview_window("main") {
                    for url in &urls {
                        if let Err(e) = window.emit("oauth-callback", url) {
                            eprintln!("[localhub] emit oauth-callback failed: {}", e);
                        }
                    }
                }
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

#[cfg(test)]
mod tests {
    /// Verifies the Recycle-Bin path actually removes a file from its original
    /// location (the destructive half of the dedup tool). Trashing a throwaway
    /// temp file is harmless — it lands in the Recycle Bin.
    #[test]
    fn trash_removes_file_from_original_location() {
        let f = std::env::temp_dir().join(format!("ce-dedup-trash-test-{}.tmp", std::process::id()));
        std::fs::write(&f, b"throwaway").unwrap();
        assert!(f.exists());
        trash::delete(&f).expect("trash::delete should succeed");
        assert!(!f.exists(), "file must be gone from its original path after trashing");
    }
}
