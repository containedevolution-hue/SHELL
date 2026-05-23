// LocalHub — Cyclone C2a (memory/apps/Cyclone-LocalHub-Conceptual.md).
//
// Minimal Tauri shell. Opens a desktop window pointing at the live PWA
// (https://app.containedevolution.com/). NO Node sidecar, NO CouchDB host
// engine yet — those land in C2b. This slice exists to verify the desktop
// wrapper works end-to-end before we layer anything on top.
//
// Dev:    `npm run dev`   (== `tauri dev`)
// Build:  `npm run build` (== `tauri build`)
// Bundling is currently OFF in tauri.conf.json (`bundle.active = false`)
// so dev works without icons; C2c will turn bundling on with real icons.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
