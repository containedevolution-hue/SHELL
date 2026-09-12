#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Compiled on Windows but intentionally not exposed through invoke_handler.
// The driver is reachable only through the exact inherited Node sidecar pipes;
// canonical Chat host authority and runtime acceptance remain separate gates.
mod chat_acceptance;
mod desktop;
#[cfg(windows)]
mod native_desk_windows;

use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::menu::{Menu, MenuItem, Submenu};
use tauri::{Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

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

// ── Flow (Wispr-clone) desktop agent — native text I/O ──────────────────────
//
// inject_text / flow_copy_selection are the system-wide half of Flow: they let
// the HUD paste cleaned dictation into whatever app has focus, and grab the
// user's current selection for Command Mode — via synthetic Ctrl+V / Ctrl+C, the
// same clipboard-paste approach Wispr uses (faster + unicode-safe vs. typing
// char-by-char). Both are called ONLY by the local-origin flow-hud window
// (capabilities/flow-hud.json); the remote PWA never touches native input.

// Send a keyboard shortcut (Ctrl + <ch>) into the focused app. Built fresh each
// call — Enigo isn't Send, so it can't be held across the async boundary.
fn send_ctrl(ch: char) -> Result<(), String> {
    use enigo::{
        Direction::{Click, Press, Release},
        Enigo, Key, Keyboard, Settings,
    };
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo.key(Key::Control, Press).map_err(|e| e.to_string())?;
    enigo
        .key(Key::Unicode(ch), Click)
        .map_err(|e| e.to_string())?;
    enigo
        .key(Key::Control, Release)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Tauri command — paste `text` into the focused app: stash the current
/// clipboard, write `text`, Ctrl+V, then restore the prior clipboard so the
/// user's copy buffer is left as we found it.
#[tauri::command]
async fn inject_text(text: String) -> Result<(), String> {
    if text.is_empty() {
        return Ok(());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
        let prev = cb.get_text().ok();
        cb.set_text(text).map_err(|e| e.to_string())?;
        std::thread::sleep(Duration::from_millis(60)); // let the write settle before paste
        send_ctrl('v')?;
        std::thread::sleep(Duration::from_millis(140)); // let the app read it before restore
        if let Some(p) = prev {
            let _ = cb.set_text(p);
        }
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| format!("inject task failed: {e}"))?
}

/// Tauri command — return the app's current text selection for Command Mode:
/// stash the clipboard, Ctrl+C, read what landed, then restore the clipboard.
/// Empty string = nothing was selected.
#[tauri::command]
async fn flow_copy_selection() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
        let prev = cb.get_text().ok();
        let _ = cb.set_text(String::new()); // clear so a no-op copy reads back empty
        std::thread::sleep(Duration::from_millis(40));
        send_ctrl('c')?;
        std::thread::sleep(Duration::from_millis(140));
        let sel = cb.get_text().unwrap_or_default();
        if let Some(p) = prev {
            let _ = cb.set_text(p);
        }
        Ok::<String, String>(sel)
    })
    .await
    .map_err(|e| format!("copy task failed: {e}"))?
}

/// Managed handle to the Node sidecar child so the ExitRequested handler can
/// kill it. Held in Tauri state because the sidecar is spawned in setup() (where
/// the AppHandle exists) rather than in main(). A `CommandChild` from the shell
/// plugin. TODO(#258): route its shutdown through a single `on_before_exit` path.
struct SidecarChild(Arc<Mutex<Option<CommandChild>>>);

#[derive(Clone)]
struct LocalAuthBootstrap(String);

fn generate_local_auth_bootstrap() -> Result<String, String> {
    let mut bytes = [0_u8; 32];
    getrandom::getrandom(&mut bytes)
        .map_err(|e| format!("local authentication entropy unavailable: {e}"))?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

#[tauri::command]
fn shell_local_auth_bootstrap(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, LocalAuthBootstrap>,
) -> Result<String, String> {
    let url = window
        .url()
        .map_err(|_| "Shell could not verify this surface URL".to_string())?;
    if trusted_local_auth_surface(window.label(), &url) {
        Ok(state.inner().0.clone())
    } else {
        Err("this Shell surface cannot request local HTTP authority".to_string())
    }
}

fn trusted_local_auth_surface(label: &str, url: &tauri::Url) -> bool {
    if label != "main" && label != "flow-hud" {
        return false;
    }
    let scheme = url.scheme();
    let host = url.host_str().unwrap_or_default();
    (scheme == "tauri" && host == "localhost")
        || ((scheme == "http" || scheme == "https") && host == "tauri.localhost")
}

/// Spawn the bundled-Node sidecar via `app.shell().sidecar("node")` (DA1). The
/// pinned `node` externalBin + the `node-sidecar/` and `whisper/` resource dirs
/// are bundled by `tauri build`, so this runs on a machine with no system Node.
///
/// Paths resolve from the app's resource dir in a packaged build and fall back to
/// the source tree for `tauri dev`. `data_dir`, when present, is a writable
/// per-user directory (from app_local_data_dir in setup) so the store,
/// pairing.json, cert, whisper model, and keys live somewhere an app update won't
/// wipe; None keeps the sidecar's legacy `<sidecar>/data` (Pi appliance unchanged).
fn spawn_sidecar(
    app: &tauri::AppHandle,
    data_dir: Option<&std::path::Path>,
    local_auth_bootstrap: &str,
    chat_runtime: chat_acceptance::SharedRuntime,
) -> Result<Arc<Mutex<Option<CommandChild>>>, String> {
    // Bundled resources (packaged) → source tree (dev). `../node-sidecar` and
    // `../whisper` are mapped to `node-sidecar`/`whisper` under the resource dir
    // by tauri.conf.json's bundle.resources.
    let resource_dir = app.path().resource_dir().ok();
    let source_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|p| p.to_path_buf());
    // Windows: `resource_dir()` returns a `\\?\`-verbatim extended-length path.
    // Node.js cannot use such a path as its main-module argument — it crashes
    // immediately with `EISDIR: lstat 'C:'` at resolveMainPath, before it can
    // require anything or listen. Strip the `\\?\` prefix from every path we hand
    // to node (script + whisper bin). app_local_data_dir() is already clean.
    fn strip_verbatim(p: std::path::PathBuf) -> std::path::PathBuf {
        match p.to_string_lossy().strip_prefix(r"\\?\") {
            Some(rest) => std::path::PathBuf::from(rest),
            None => p,
        }
    }
    let resolve = |rel: &str| -> Option<std::path::PathBuf> {
        resource_dir
            .as_ref()
            .map(|d| d.join(rel))
            .filter(|p| p.exists())
            .or_else(|| {
                source_dir
                    .as_ref()
                    .map(|d| d.join(rel))
                    .filter(|p| p.exists())
            })
            .map(strip_verbatim)
    };

    let script = resolve("node-sidecar/index.js")
        .ok_or_else(|| "sidecar index.js not found in resources or source tree".to_string())?;
    #[cfg(windows)]
    let native_registry = resolve("node-sidecar/config/native-desk-clients.json")
        .ok_or_else(|| "native desk registry not found in resources or source tree".to_string())?;
    println!(
        "[localhub] spawning bundled-node sidecar: {}",
        script.display()
    );

    // Flow NO-API engine — tell the sidecar where whisper.cpp lives, if present.
    // TODO(#256): the whisper.cpp CLI is not provisioned or bundled yet, so this
    // resolves to None and Flow dictation is simply absent until the whisper/
    // artifact and its bundle.resources entry land. Only set a default when the
    // launching env hasn't already (dev override).
    let whisper_name = if cfg!(windows) {
        "whisper/whisper-cli.exe"
    } else {
        "whisper/whisper-cli"
    };
    let whisper_bin = resolve(whisper_name);

    let mut cmd = app
        .shell()
        .sidecar("node")
        .map_err(|e| {
            format!("sidecar(\"node\") unavailable — is binaries/node-<triple> bundled? {e}")
        })?
        .arg(script.to_string_lossy().to_string());

    // ExitRequested only fires on a graceful quit. A Task Manager kill or a crash
    // skips it and leaves node.exe holding port 5984 and the LevelDB lock, which
    // then fails the next install with "Error opening file for writing". Handing
    // the sidecar our pid lets it exit on its own when we disappear by any route.
    cmd = cmd
        .env("LOCALHUB_PARENT_PID", std::process::id().to_string())
        .env("SHELL_LOCAL_AUTH_BOOTSTRAP", local_auth_bootstrap);
    #[cfg(windows)]
    let (native_secret, native_session) = (
        generate_local_auth_bootstrap()?,
        format!("native-{}", generate_local_auth_bootstrap()?),
    );
    #[cfg(windows)]
    {
        cmd = cmd
            .env("SHELL_NATIVE_DESK_PIPE", "enabled")
            .env("SHELL_NATIVE_DESK_SECRET", &native_secret)
            .env("SHELL_NATIVE_DESK_SESSION", &native_session)
            .env(
                "SHELL_NATIVE_DESK_PARENT_PID",
                std::process::id().to_string(),
            );
    }

    if std::env::var_os("WHISPER_BIN").is_none() {
        if let Some(w) = whisper_bin {
            cmd = cmd.env("WHISPER_BIN", w.to_string_lossy().to_string());
        }
    }
    // DA0: point every persistent path at the per-user data dir so a whole
    // relocation moves together (no split-brain where the store moves but
    // pairing.json stays behind and the box silently unpairs on the next update).
    if let Some(dir) = data_dir {
        let _ = std::fs::create_dir_all(dir);
        cmd = cmd
            .env("LOCALHUB_DATA_DIR", dir.to_string_lossy().to_string())
            .env(
                "WHISPER_MODEL_DIR",
                dir.join("whisper").to_string_lossy().to_string(),
            )
            .env(
                "ELEVENLABS_KEY_FILE",
                dir.join("elevenlabs.json").to_string_lossy().to_string(),
            );
    }
    // Consumer build excludes Media-Lab asset-forge — tell the sidecar not to
    // mount/require it (its scripts aren't bundled in that build).
    #[cfg(feature = "consumer")]
    {
        cmd = cmd.env("CE_CONSUMER", "1");
    }

    let (mut rx, child) = cmd
        .spawn()
        .map_err(|e| format!("failed to spawn sidecar: {e}"))?;
    let child_pid = child.pid();
    let shared_child = Arc::new(Mutex::new(Some(child)));
    let response_child = shared_child.clone();
    #[cfg(windows)]
    let mut native_pipe = match native_desk_windows::NativeDeskPipe::from_registry_with_chat(
        &native_registry,
        native_secret,
        native_session,
        std::process::id(),
        child_pid,
        chat_runtime,
    ) {
        Ok(pipe) => pipe,
        Err(error) => {
            if let Ok(mut guard) = shared_child.lock() {
                if let Some(child) = guard.take() {
                    let _ = child.kill();
                }
            }
            return Err(error);
        }
    };

    // Drain stdout/stderr so the pipe never backpressures and the sidecar's logs
    // surface in the app console. Ends when the child terminates (channel closes).
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    #[cfg(windows)]
                    if native_pipe.owns_line(&line) {
                        if let Some(response) = native_pipe.handle_line(&line) {
                            if let Ok(mut guard) = response_child.lock() {
                                if let Some(child) = guard.as_mut() {
                                    let _ = child.write(&response);
                                }
                            }
                        }
                        continue;
                    }
                    print!("[sidecar] {}", String::from_utf8_lossy(&line))
                }
                CommandEvent::Stderr(line) => {
                    eprint!("[sidecar] {}", String::from_utf8_lossy(&line))
                }
                CommandEvent::Error(e) => eprintln!("[sidecar] error: {e}"),
                CommandEvent::Terminated(payload) => {
                    eprintln!("[sidecar] terminated: {payload:?}");
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(shared_child)
}

fn main() {
    // The sidecar is spawned in setup() (below) — it needs the AppHandle to
    // resolve app_local_data_dir(). The child is stored in managed state so the
    // ExitRequested handler can still kill it.

    // Flow global hotkeys (system-wide): Ctrl+Alt+Space = dictate, Ctrl+Alt+.
    // = Command Mode. Cloned into the plugin handler; the originals are
    // registered in setup(). The chords are fixed, not user-configurable.
    let dictate_sc = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::Space);
    let command_sc = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::Period);
    let (hd, hc) = (dictate_sc.clone(), command_sc.clone());

    let local_auth_bootstrap =
        generate_local_auth_bootstrap().expect("secure local authentication bootstrap");
    let chat_runtime = chat_acceptance::Runtime::shared();
    let navigation_runtime = chat_runtime.clone();
    let setup_chat_runtime = chat_runtime.clone();
    let app = tauri::Builder::default()
        .manage(LocalAuthBootstrap(local_auth_bootstrap))
        // single-instance MUST be registered before deep-link so a second
        // `start localhub://...` invocation forwards its args to the running
        // process instead of spawning a fresh Tauri shell.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            println!("[localhub] single-instance trigger: {:?}", args);
            if let Some(window) = app.get_webview_window("desktop") {
                let _ = window.show();
                let _ = window.set_focus();
                return;
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri::plugin::Builder::<tauri::Wry, ()>::new("chat-acceptance-navigation")
            .on_navigation(move |webview, url| {
                let allowed = chat_acceptance::navigation_allowed(webview.label(), url);
                if !allowed && webview.label() == chat_acceptance::WINDOW_LABEL {
                    if let Ok(mut state) = navigation_runtime.lock() { state.revoke_current(); }
                }
                allowed
            })
            .build())
        // DA1 — launches the bundled Node externalBin as the sidecar.
        .plugin(tauri_plugin_shell::init())
        // Flow: OS-level push-to-talk. On press we reveal the HUD overlay and
        // emit `flow-hotkey` (mode) — the flow-hud window records/injects; the
        // remote PWA never sees native input. Fires regardless of focus, so it
        // works while the user is in Gmail/VS Code/anywhere.
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    let mode = if *shortcut == hd {
                        "dictate"
                    } else if *shortcut == hc {
                        "command"
                    } else {
                        return;
                    };
                    if let Some(hud) = app.get_webview_window("flow-hud") {
                        let _ = hud.show();
                    }
                    let _ = app.emit("flow-hotkey", mode);
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            desktop::desktop_roots,
            desktop::desktop_list,
            desktop::desktop_pick_folder,
            desktop::desktop_open_file,
            desktop::desktop_open_apps,
            desktop::desktop_powerhouse_status,
            desktop::desktop_security_status,
            desktop::desktop_system_settings,
            scan_duplicates,
            delete_to_trash,
            inject_text,
            flow_copy_selection,
            shell_local_auth_bootstrap
        ])
        .setup(move |app| {
            desktop::start(app.handle())?;
            // DA0: spawn the sidecar here so app_local_data_dir() is resolvable.
            // Point the sidecar at "<app_local_data_dir>/data" — a writable per-user
            // location an app update won't wipe. If it can't be resolved, spawn
            // without it (the sidecar falls back to its legacy path with a warning).
            let data_dir = app.path().app_local_data_dir().ok().map(|p| p.join("data"));
            if data_dir.is_none() {
                eprintln!("[localhub] WARN: app_local_data_dir() unavailable — sidecar uses its legacy data path");
            }
            let local_auth_bootstrap = app.state::<LocalAuthBootstrap>().inner().0.clone();
            let child = match spawn_sidecar(app.handle(), data_dir.as_deref(), &local_auth_bootstrap, setup_chat_runtime.clone()) {
                Ok(c) => {
                    if let Ok(guard) = c.lock() {
                        if let Some(child) = guard.as_ref() { println!("[localhub] sidecar pid: {}", child.pid()); }
                    }
                    Some(c)
                }
                Err(e) => {
                    eprintln!(
                        "[localhub] WARN: failed to spawn sidecar ({}). The desktop \
                         shell will still open, but http://localhost:5984/ won't be \
                         available. Verify the bundled node binary is present \
                         (`node scripts/fetch-node-binary.mjs`) and the sidecar deps \
                         are installed (`cd node-sidecar && npm install`).",
                        e
                    );
                    None
                }
            };
            app.manage(SidecarChild(child.unwrap_or_else(|| Arc::new(Mutex::new(None)))));

            // Flow: register the global hotkeys + make the HUD click-through
            // (an always-on-top pill that never steals focus/clicks from the app
            // the user is actually typing into).
            if let Err(e) = app.global_shortcut().register(dictate_sc.clone()) {
                eprintln!("[localhub] WARN: could not register dictate hotkey: {e}");
            }
            if let Err(e) = app.global_shortcut().register(command_sc.clone()) {
                eprintln!("[localhub] WARN: could not register command hotkey: {e}");
            }
            if let Some(hud) = app.get_webview_window("flow-hud") {
                let _ = hud.set_ignore_cursor_events(true);
            }
            // Tools → "Photo Duplicates" opens the local dedup tool window — a
            // bundled local page (dedup.html), created hidden at launch in
            // tauri.conf.json and shown on demand. Local origin = it can call
            // scan_duplicates / delete_to_trash directly (capabilities/dedup.json).
            let open_dedup =
                MenuItem::with_id(app, "open_dedup", "Photo Duplicates", true, None::<&str>)?;
            let acceptance_enabled = std::env::var("SHELL_CHAT_ACCEPTANCE_WINDOW").as_deref() == Ok("enabled");
            let open_chat_acceptance = MenuItem::with_id(app, "open_chat_acceptance", "Open disposable Chat acceptance", acceptance_enabled, None::<&str>)?;
            let close_chat_acceptance = MenuItem::with_id(app, "close_chat_acceptance", "Close disposable Chat acceptance", acceptance_enabled, None::<&str>)?;
            let tools = Submenu::with_items(app, "Tools", true, &[&open_dedup, &open_chat_acceptance, &close_chat_acceptance])?;
            let menu = Menu::with_items(app, &[&tools])?;
            app.set_menu(menu)?;
            let menu_chat_runtime = setup_chat_runtime.clone();
            let acceptance_base = data_dir.clone().map(|value| value.join("chat-acceptance"));
            app.on_menu_event(move |app_handle, event| {
                match event.id().0.as_str() {
                    "open_dedup" => {
                        if let Some(w) = app_handle.get_webview_window("dedup") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "open_chat_acceptance" => {
                        let result = acceptance_base.as_deref().ok_or_else(|| "Shell application data is unavailable.".to_string())
                            .and_then(|base| chat_acceptance::open(app_handle, menu_chat_runtime.clone(), base));
                        if let Err(error) = result { eprintln!("[chat-acceptance] open refused: {error}"); }
                    }
                    "close_chat_acceptance" => {
                        if let Err(error) = chat_acceptance::close(app_handle, menu_chat_runtime.clone()) { eprintln!("[chat-acceptance] close failed: {error}"); }
                    }
                    _ => {}
                }
            });

            // On Linux + Windows-dev, the deep-link plugin can register the
            // `localhub://` scheme in the OS at runtime. macOS reads it from
            // Info.plist (bundled). Production Windows registration is the
            // installer's job, not this call's.
            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            {
                let _ = app.deep_link().register_all();
            }

            // When a deep-link URL arrives, forward it to the main
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

    app.run(move |handle, event| {
        if let tauri::RunEvent::ExitRequested { .. } = event {
            if let Some(state) = handle.try_state::<SidecarChild>() {
                if let Ok(mut guard) = state.0.lock() {
                    if let Some(child) = guard.take() {
                        println!("[localhub] killing sidecar pid: {}", child.pid());
                        // CommandChild::kill consumes self and releases the LevelDB
                        // LOCK. TODO(#258): a force-kill never reaches here, which
                        // is what strands the sidecar on the port and the LOCK.
                        let _ = child.kill();
                    }
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::trusted_local_auth_surface;

    #[test]
    fn local_auth_bootstrap_is_bound_to_exact_bundled_surfaces() {
        let bundled = tauri::Url::parse("http://tauri.localhost/flow-hud.html").unwrap();
        let installed =
            tauri::Url::parse("http://127.0.0.1:5984/v1/apps/notes/web/index.html").unwrap();
        let provider = tauri::Url::parse("https://app.tenari.world/").unwrap();
        assert!(trusted_local_auth_surface("flow-hud", &bundled));
        assert!(trusted_local_auth_surface("main", &bundled));
        assert!(!trusted_local_auth_surface("dedup", &bundled));
        assert!(!trusted_local_auth_surface("main", &installed));
        assert!(!trusted_local_auth_surface("main", &provider));
    }

    /// Verifies the Recycle-Bin path actually removes a file from its original
    /// location (the destructive half of the dedup tool). Trashing a throwaway
    /// temp file is harmless — it lands in the Recycle Bin.
    #[test]
    fn trash_removes_file_from_original_location() {
        let f =
            std::env::temp_dir().join(format!("ce-dedup-trash-test-{}.tmp", std::process::id()));
        std::fs::write(&f, b"throwaway").unwrap();
        assert!(f.exists());
        trash::delete(&f).expect("trash::delete should succeed");
        assert!(
            !f.exists(),
            "file must be gone from its original path after trashing"
        );
    }
}
