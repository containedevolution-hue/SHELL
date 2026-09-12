//! Native desktop entry and owner-driven file navigation. No HTTP or agent grants.
use serde::Serialize;
#[cfg(target_os = "linux")]
use std::process::Command;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::UNIX_EPOCH,
};
use tauri::{Manager, WebviewUrl, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

const LABEL: &str = "desktop";
const ENTRY: &str = "/desktop/index.html";
const MAX_ENTRIES: usize = 5000;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Root {
    name: String,
    path: String,
}
#[derive(Default)]
pub struct Files {
    roots: Mutex<Vec<Root>>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    name: String,
    path: String,
    kind: String,
    size: Option<u64>,
    modified_at: Option<u64>,
    can_open: bool,
    problem: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Listing {
    path: String,
    parent: Option<String>,
    entries: Vec<Entry>,
    truncated: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecurityComponent {
    available: bool,
    state: String,
    detail: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecurityStatus {
    platform_supported: bool,
    network: SecurityComponent,
    vpn: SecurityComponent,
    firewall: SecurityComponent,
}

fn display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}
fn problem(error: std::io::Error) -> String {
    match error.kind() {
        std::io::ErrorKind::PermissionDenied => "This account cannot read that location.".into(),
        std::io::ErrorKind::NotFound => "That location is no longer available.".into(),
        _ => format!("The filesystem could not complete the request: {error}"),
    }
}
fn trusted(label: &str, url: &tauri::Url) -> bool {
    label == LABEL
        && url.path() == ENTRY
        && url.query().is_none()
        && url.fragment().is_none()
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
        && ((url.scheme() == "tauri" && url.host_str() == Some("localhost"))
            || (matches!(url.scheme(), "http" | "https")
                && url.host_str() == Some("tauri.localhost")))
}
fn authorize(window: &WebviewWindow) -> Result<(), String> {
    let url = window
        .url()
        .map_err(|_| "Cannot verify the desktop window.")?;
    if trusted(window.label(), &url) {
        Ok(())
    } else {
        Err("Only the local Shell desktop can use this operation.".into())
    }
}
fn resolve(input: &str, roots: &[Root]) -> Result<PathBuf, String> {
    let requested = Path::new(input);
    if !requested.is_absolute() {
        return Err("Choose an absolute folder path.".into());
    }
    let actual = fs::canonicalize(requested).map_err(problem)?;
    if roots
        .iter()
        .any(|root| actual.starts_with(Path::new(&root.path)))
    {
        Ok(actual)
    } else {
        Err("Choose this location with Add folder before browsing it.".into())
    }
}
fn add_root(roots: &mut Vec<Root>, name: String, path: PathBuf) -> Result<(), String> {
    let path = fs::canonicalize(path).map_err(problem)?;
    if !path.is_dir() {
        return Err("Choose a folder.".into());
    }
    let text = display(&path);
    if !roots.iter().any(|root| root.path == text) {
        roots.push(Root { name, path: text });
    }
    Ok(())
}
fn openable(path: &Path, meta: &fs::Metadata) -> bool {
    if !meta.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if meta.permissions().mode() & 0o111 != 0 {
            return false;
        }
    }
    matches!(
        path.extension()
            .and_then(|v| v.to_str())
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str(),
        "txt"
            | "md"
            | "log"
            | "csv"
            | "json"
            | "pdf"
            | "png"
            | "jpg"
            | "jpeg"
            | "webp"
            | "gif"
            | "bmp"
            | "mp3"
            | "wav"
            | "flac"
            | "ogg"
            | "mp4"
            | "mkv"
            | "webm"
            | "docx"
            | "xlsx"
            | "pptx"
            | "odt"
            | "ods"
            | "odp"
    )
}

#[cfg(target_os = "linux")]
fn output(program: &str, arguments: &[&str]) -> Option<String> {
    let result = Command::new(program).args(arguments).output().ok()?;
    if !result.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&result.stdout).trim().to_string())
}

#[cfg(any(target_os = "linux", test))]
fn private_connection_names(active_connections: &str) -> Vec<String> {
    active_connections
        .lines()
        .filter_map(|line| {
            let (kind, name) = line.split_once(':')?;
            matches!(kind, "vpn" | "wireguard").then(|| name.to_string())
        })
        .collect()
}

#[cfg(target_os = "linux")]
fn linux_security_status() -> SecurityStatus {
    let network_state = output("nmcli", &["-t", "-f", "STATE", "general"]);
    let active_connections = output(
        "nmcli",
        &[
            "-t",
            "--escape",
            "no",
            "-f",
            "TYPE,NAME",
            "connection",
            "show",
            "--active",
        ],
    );
    let vpn_names = private_connection_names(active_connections.as_deref().unwrap_or(""));
    let vpn_available = active_connections.is_some();
    let vpn_state = if !vpn_available {
        "Unavailable"
    } else if vpn_names.is_empty() {
        "No active tunnel"
    } else {
        "Connected"
    };
    let vpn_detail = if vpn_names.is_empty() {
        "No active VPN profile reported by NetworkManager.".into()
    } else {
        format!("Active: {}", vpn_names.join(", "))
    };
    let firewall_unit = ["shell-firewall.service", "nftables.service"]
        .into_iter()
        .find(|unit| output("systemctl", &["cat", unit]).is_some());
    let (firewall_available, firewall_state, firewall_detail) = match firewall_unit {
        Some(unit) => {
            let enabled =
                output("systemctl", &["is-enabled", unit]).unwrap_or_else(|| "unknown".into());
            let active =
                output("systemctl", &["is-active", unit]).unwrap_or_else(|| "unknown".into());
            (true, active.clone(), format!("{unit}; startup: {enabled}"))
        }
        None => (
            false,
            "Unavailable".into(),
            "No managed nftables service was found.".into(),
        ),
    };
    SecurityStatus {
        platform_supported: true,
        network: SecurityComponent {
            available: network_state.is_some(),
            state: network_state
                .clone()
                .unwrap_or_else(|| "Unavailable".into()),
            detail: if network_state.is_some() {
                "Reported by NetworkManager."
            } else {
                "NetworkManager could not be read."
            }
            .into(),
        },
        vpn: SecurityComponent {
            available: vpn_available,
            state: vpn_state.into(),
            detail: vpn_detail,
        },
        firewall: SecurityComponent {
            available: firewall_available,
            state: firewall_state,
            detail: firewall_detail,
        },
    }
}

#[cfg(not(target_os = "linux"))]
fn linux_security_status() -> SecurityStatus {
    let unavailable = || SecurityComponent {
        available: false,
        state: "Unavailable".into(),
        detail: "Native security evidence is connected on CEE OS Linux.".into(),
    };
    SecurityStatus {
        platform_supported: false,
        network: unavailable(),
        vpn: unavailable(),
        firewall: unavailable(),
    }
}
fn listing(input: &str, roots: &[Root], hidden: bool) -> Result<Listing, String> {
    let path = resolve(input, roots)?;
    let directory = fs::read_dir(&path).map_err(problem)?;
    let mut entries = Vec::new();
    let mut truncated = false;
    for item in directory {
        let item = item.map_err(problem)?;
        let name = item.file_name().to_string_lossy().into_owned();
        if !hidden && name.starts_with('.') {
            continue;
        }
        if entries.len() == MAX_ENTRIES {
            truncated = true;
            break;
        }
        let item_path = item.path();
        let resolved = resolve(&display(&item_path), roots);
        let (kind, size, modified_at, can_open, issue) = match resolved.and_then(|actual| {
            fs::metadata(&actual)
                .map(|meta| (actual, meta))
                .map_err(problem)
        }) {
            Ok((actual, meta)) => {
                let kind = if meta.is_dir() {
                    "folder"
                } else if meta.is_file() {
                    "file"
                } else {
                    "special"
                };
                let can_open = openable(&actual, &meta);
                (
                    kind.to_string(),
                    if meta.is_file() {
                        Some(meta.len())
                    } else {
                        None
                    },
                    meta.modified()
                        .ok()
                        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                        .map(|d| d.as_secs()),
                    can_open,
                    None,
                )
            }
            Err(error) => ("unavailable".into(), None, None, false, Some(error)),
        };
        entries.push(Entry {
            name,
            path: display(&item_path),
            kind,
            size,
            modified_at,
            can_open,
            problem: issue,
        });
    }
    entries.sort_by(|a, b| {
        (a.kind != "folder")
            .cmp(&(b.kind != "folder"))
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
            .then_with(|| a.name.cmp(&b.name))
    });
    let parent = path
        .parent()
        .filter(|p| roots.iter().any(|root| p.starts_with(&root.path)))
        .map(display);
    Ok(Listing {
        path: display(&path),
        parent,
        entries,
        truncated,
    })
}

#[tauri::command]
pub fn desktop_roots(
    window: WebviewWindow,
    state: tauri::State<'_, Files>,
) -> Result<Vec<Root>, String> {
    authorize(&window)?;
    Ok(state
        .roots
        .lock()
        .map_err(|_| "Folder state unavailable.")?
        .clone())
}
#[tauri::command]
pub async fn desktop_list(
    window: WebviewWindow,
    state: tauri::State<'_, Files>,
    path: String,
    hidden: bool,
) -> Result<Listing, String> {
    authorize(&window)?;
    let roots = state
        .roots
        .lock()
        .map_err(|_| "Folder state unavailable.")?
        .clone();
    tauri::async_runtime::spawn_blocking(move || listing(&path, &roots, hidden))
        .await
        .map_err(|_| "Folder reading was interrupted.".to_string())?
}
#[tauri::command]
pub async fn desktop_pick_folder(
    window: WebviewWindow,
    app: tauri::AppHandle,
) -> Result<Option<Root>, String> {
    authorize(&window)?;
    let picker_app = app.clone();
    let selected = tauri::async_runtime::spawn_blocking(move || {
        picker_app
            .dialog()
            .file()
            .set_title("Add a folder to Core")
            .blocking_pick_folder()
    })
    .await
    .map_err(|_| "Folder selection was interrupted.")?;
    authorize(&window)?;
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected.into_path().map_err(|_| "Choose a local folder.")?;
    let name = path
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| display(&path));
    let state = app.state::<Files>();
    let mut roots = state
        .roots
        .lock()
        .map_err(|_| "Folder state unavailable.")?;
    add_root(&mut roots, name, path.clone())?;
    let canonical = display(&fs::canonicalize(path).map_err(problem)?);
    Ok(roots.iter().find(|r| r.path == canonical).cloned())
}
#[tauri::command]
pub fn desktop_open_file(
    window: WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<'_, Files>,
    path: String,
) -> Result<(), String> {
    authorize(&window)?;
    let roots = state
        .roots
        .lock()
        .map_err(|_| "Folder state unavailable.")?;
    let actual = resolve(&path, &roots)?;
    let meta = fs::metadata(&actual).map_err(problem)?;
    if !openable(&actual, &meta) {
        return Err("This file type cannot be opened from Core yet. Executables and scripts are not launched here.".into());
    }
    app.opener()
        .open_path(display(&actual), None::<&str>)
        .map_err(|error| format!("The default application could not open this file: {error}"))
}
#[tauri::command]
pub fn desktop_open_apps(window: WebviewWindow, app: tauri::AppHandle) -> Result<(), String> {
    authorize(&window)?;
    let launcher = app
        .get_webview_window("main")
        .ok_or("The application launcher is unavailable.")?;
    launcher
        .show()
        .and_then(|_| launcher.set_focus())
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn desktop_security_status(window: WebviewWindow) -> Result<SecurityStatus, String> {
    authorize(&window)?;
    tauri::async_runtime::spawn_blocking(linux_security_status)
        .await
        .map_err(|_| "Security evidence collection was interrupted.".to_string())
}
#[tauri::command]
pub fn desktop_system_settings(window: WebviewWindow, app: tauri::AppHandle) -> Result<(), String> {
    authorize(&window)?;
    #[cfg(target_os = "linux")]
    {
        let _ = app;
        let mut child = std::process::Command::new("systemsettings")
            .spawn()
            .map_err(|e| format!("KDE System Settings could not open: {e}"))?;
        std::thread::spawn(move || {
            let _ = child.wait();
        });
        Ok(())
    }
    #[cfg(target_os = "windows")]
    {
        app.opener()
            .open_url("ms-settings:", None::<&str>)
            .map_err(|e| e.to_string())
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        let _ = app;
        Err("System settings are not connected on this platform.".into())
    }
}
pub fn start(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    if std::env::var("SHELL_DESKTOP").as_deref() != Ok("enabled") {
        return Ok(());
    }
    let mut roots = Vec::new();
    for (name, path) in [
        ("Home", app.path().home_dir()),
        ("Documents", app.path().document_dir()),
        ("Downloads", app.path().download_dir()),
        ("Pictures", app.path().picture_dir()),
    ] {
        if let Ok(path) = path {
            let _ = add_root(&mut roots, name.into(), path);
        }
    }
    app.manage(Files {
        roots: Mutex::new(roots),
    });
    let desktop =
        tauri::WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("desktop/index.html".into()))
            .title("CEE OS — Desktop")
            .inner_size(1280.0, 800.0)
            .min_inner_size(800.0, 600.0)
            .on_navigation(|url| trusted(LABEL, url))
            .build()?;
    let desktop_app = app.clone();
    desktop.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
            desktop_app.exit(0);
        }
    });
    if let Some(launcher) = app.get_webview_window("main") {
        let launcher_window = launcher.clone();
        launcher.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = launcher_window.hide();
            }
        });
    }
    if let Some(launcher) = app.get_webview_window("main") {
        launcher.hide()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Temp(PathBuf);
    impl Temp {
        fn new() -> Self {
            let mut bytes = [0; 8];
            getrandom::getrandom(&mut bytes).unwrap();
            let p = std::env::temp_dir().join(format!("shell-files-{}", u64::from_ne_bytes(bytes)));
            fs::create_dir(&p).unwrap();
            Self(p)
        }
    }
    impl Drop for Temp {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    fn roots(p: &Path) -> Vec<Root> {
        vec![Root {
            name: "Test".into(),
            path: display(&fs::canonicalize(p).unwrap()),
        }]
    }
    #[test]
    fn only_exact_local_desktop_has_authority() {
        for uri in [
            "tauri://localhost/desktop/index.html",
            "http://tauri.localhost/desktop/index.html",
            "https://tauri.localhost/desktop/index.html",
        ] {
            assert!(trusted(LABEL, &uri.parse().unwrap()));
            assert!(!trusted("main", &uri.parse().unwrap()));
        }
        for uri in [
            "http://127.0.0.1:4176/desktop/index.html",
            "https://evil.example/desktop/index.html",
            "tauri://localhost/index.html",
            "tauri://localhost/desktop/index.html?grant=all",
            "http://tauri.localhost:5984/desktop/index.html",
        ] {
            assert!(!trusted(LABEL, &uri.parse().unwrap()));
        }
    }
    #[test]
    fn real_directory_is_sorted_and_hidden_items_are_opt_in() {
        let t = Temp::new();
        fs::write(t.0.join("z.txt"), b"hello").unwrap();
        fs::write(t.0.join(".private"), b"hidden").unwrap();
        fs::create_dir(t.0.join("Folder")).unwrap();
        let r = roots(&t.0);
        let data = listing(&display(&t.0), &r, false).unwrap();
        assert_eq!(
            data.entries
                .iter()
                .map(|e| e.name.as_str())
                .collect::<Vec<_>>(),
            vec!["Folder", "z.txt"]
        );
        assert_eq!(data.entries[1].size, Some(5));
        assert!(data.parent.is_none());
        assert!(data.entries[1].can_open);
        assert_eq!(listing(&display(&t.0), &r, true).unwrap().entries.len(), 3);
    }
    #[test]
    fn traversal_outside_roots_and_missing_paths_fail_closed() {
        let t = Temp::new();
        let r = roots(&t.0);
        assert!(resolve("relative", &r).is_err());
        assert!(resolve(&display(&t.0.join("..")), &r).is_err());
        assert!(listing(&display(&t.0.join("gone")), &r, false).is_err());
    }
    #[cfg(unix)]
    #[test]
    fn symlinks_do_not_widen_the_selected_roots() {
        let t = Temp::new();
        let other = Temp::new();
        std::os::unix::fs::symlink(&other.0, t.0.join("outside")).unwrap();
        assert!(resolve(&display(&t.0.join("outside")), &roots(&t.0)).is_err());
    }
    #[test]
    fn scripts_and_programs_are_not_openable() {
        let t = Temp::new();
        for name in [
            "run.exe",
            "run.desktop",
            "run.sh",
            "run.ps1",
            "run.bat",
            "page.html",
        ] {
            let p = t.0.join(name);
            fs::write(&p, b"data").unwrap();
            assert!(!openable(&p, &fs::metadata(&p).unwrap()));
        }
    }
    #[test]
    fn non_linux_security_status_never_invents_live_state() {
        #[cfg(not(target_os = "linux"))]
        {
            let status = linux_security_status();
            assert!(!status.platform_supported);
            assert!(!status.network.available);
            assert!(!status.vpn.available);
            assert!(!status.firewall.available);
        }
    }
    #[test]
    fn active_connection_parser_keeps_only_private_tunnels() {
        assert_eq!(
            private_connection_names(
                "802-3-ethernet:LAN\nwireguard:Home tunnel\nvpn:Work\nloopback:lo"
            ),
            vec!["Home tunnel", "Work"]
        );
    }
}
