//! Disposable, fail-closed host for the pinned private Chat acceptance build.
//! Nothing here is registered as a page-visible Tauri command.

#![allow(dead_code)]
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

pub(crate) const WINDOW_LABEL: &str = "chat-acceptance";
const RELEASE_ID: &str = "chat";
const RELEASE_VERSION: &str = "0.1.0-dev";
const RELEASE_SHA256: &str = "2261aba0f5a2b8d79339d5072e992c7457c7a9e9ce8139e5c3246a804ff4d1b7";
const ASSET_ORIGIN: &str = "http://127.0.0.1:5984";
const ASSET_PATH: &str = "/__shell/chat-acceptance/web/index.html";
pub(crate) type SharedRuntime = Arc<Mutex<Runtime>>;

pub(crate) fn navigation_allowed(label: &str, url: &tauri::Url) -> bool {
    if label != WINDOW_LABEL {
        return true;
    }
    url.scheme() == "http"
        && url.host_str() == Some("127.0.0.1")
        && url.port() == Some(5984)
        && url.path() == ASSET_PATH
        && url.query().is_none()
        && url.fragment().is_none()
}
fn millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
fn token(prefix: &str) -> Result<String, String> {
    let mut b = [0u8; 16];
    getrandom::getrandom(&mut b)
        .map_err(|_| "Chat acceptance entropy is unavailable.".to_string())?;
    Ok(format!(
        "{prefix}-{}",
        b.iter().map(|v| format!("{v:02x}")).collect::<String>()
    ))
}
fn safe_child(root: &Path, relative: &str) -> Option<PathBuf> {
    if relative.is_empty() || relative.contains('\\') {
        return None;
    }
    let p = PathBuf::from(relative);
    if p.is_absolute()
        || p.components().any(|c| {
            matches!(
                c,
                std::path::Component::ParentDir | std::path::Component::Prefix(_)
            )
        })
    {
        None
    } else {
        Some(root.join(p))
    }
}
fn hash(path: &Path) -> Result<String, String> {
    Ok(format!(
        "{:x}",
        Sha256::digest(
            std::fs::read(path)
                .map_err(|_| "Chat acceptance installation is unavailable.".to_string())?
        )
    ))
}

#[derive(serde::Deserialize)]
struct Receipt {
    id: String,
    version: String,
    private: bool,
    stage: String,
    sha256: String,
    files: BTreeMap<String, String>,
}
pub(crate) fn verify_install(base: &Path) -> Result<PathBuf, String> {
    let root = base.join(RELEASE_ID);
    let r: Receipt = serde_json::from_slice(
        &std::fs::read(root.join(".shell-chat-acceptance.json"))
            .map_err(|_| "Chat acceptance receipt is unavailable.".to_string())?,
    )
    .map_err(|_| "Chat acceptance receipt is invalid.".to_string())?;
    if r.id != RELEASE_ID
        || r.version != RELEASE_VERSION
        || !r.private
        || r.stage != "acceptance"
        || r.sha256 != RELEASE_SHA256
        || r.files.is_empty()
    {
        return Err("Chat acceptance receipt does not match the pinned private release.".into());
    }
    for (relative, digest) in r.files {
        let file = safe_child(&root, &relative)
            .ok_or_else(|| "Chat acceptance receipt contains an unsafe path.".to_string())?;
        if digest.len() != 64 || hash(&file)? != digest {
            return Err("Chat acceptance installed files failed integrity validation.".into());
        }
    }
    if !root.join("web/index.html").is_file() {
        return Err("Chat acceptance entrypoint is unavailable.".into());
    }
    Ok(root)
}

#[derive(Clone, Debug, Serialize)]
struct Viewport {
    width: f64,
    height: f64,
}
#[derive(Clone, Debug, Serialize)]
struct Rect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Layout {
    observed_at: u64,
    content_matches_window: bool,
    window_id: String,
    native_session_id: String,
    compositor_size: [i32; 2],
    viewport: Viewport,
    rect: Rect,
    monitor_scale: f64,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Observation {
    id: &'static str,
    version: &'static str,
    sha256: &'static str,
    private: bool,
    stage: &'static str,
    window_label: &'static str,
    origin: &'static str,
    url: String,
    alive: bool,
    process_id: u32,
    window_id: String,
    native_session_id: String,
    frame_id: String,
    navigation_id: String,
    asset_root: String,
    workspace_id: i32,
    window_bounds: [i32; 4],
    layout: Layout,
}

pub(crate) struct Runtime {
    generation: u64,
    current: Option<Observation>,
    revoked: bool,
}
impl Runtime {
    pub(crate) fn shared() -> SharedRuntime {
        Arc::new(Mutex::new(Self {
            generation: 0,
            current: None,
            revoked: false,
        }))
    }
    fn begin(&mut self, w: &WebviewWindow, root: &Path) -> Result<u64, String> {
        self.generation += 1;
        self.revoked = false;
        let g = self.generation;
        self.current = Some(capture(w, root, token("frame")?, token("navigation")?)?);
        Ok(g)
    }
    fn refresh(&mut self, g: u64, w: &WebviewWindow, root: &Path) -> Result<(), String> {
        if self.revoked || self.generation != g {
            return Err("Chat acceptance authority is revoked.".into());
        }
        let old = self
            .current
            .clone()
            .ok_or_else(|| "Chat acceptance window is unavailable.".to_string())?;
        let next = capture(w, root, old.frame_id.clone(), old.navigation_id.clone())?;
        if next.process_id != old.process_id
            || next.window_id != old.window_id
            || next.native_session_id != old.native_session_id
        {
            self.revoke(g);
            return Err("Chat acceptance native window was replaced.".into());
        }
        self.current = Some(next);
        Ok(())
    }
    pub(crate) fn revoke(&mut self, g: u64) {
        if self.generation == g {
            self.revoked = true;
            self.current = None
        }
    }
    pub(crate) fn revoke_current(&mut self) {
        self.revoked = true;
        self.current = None
    }
    pub(crate) fn observe(&self) -> Result<Value, String> {
        let v = self
            .current
            .as_ref()
            .filter(|_| !self.revoked)
            .ok_or_else(|| "Chat acceptance window is unavailable.".to_string())?;
        if millis().saturating_sub(v.layout.observed_at) > 1000 {
            return Err("Chat acceptance geometry is stale.".into());
        }
        serde_json::to_value(v)
            .map_err(|_| "Chat acceptance observation serialization failed.".to_string())
    }
}
#[cfg(windows)]
fn native_id(w: &WebviewWindow) -> Result<String, String> {
    Ok(format!(
        "0x{:x}",
        w.hwnd()
            .map_err(|_| "Chat acceptance HWND is unavailable.".to_string())?
            .0 as usize
    ))
}
#[cfg(not(windows))]
fn native_id(w: &WebviewWindow) -> Result<String, String> {
    Ok(format!("{}:{}", std::process::id(), w.label()))
}
fn capture(
    w: &WebviewWindow,
    root: &Path,
    frame_id: String,
    navigation_id: String,
) -> Result<Observation, String> {
    let url = w
        .url()
        .map_err(|_| "Chat acceptance navigation is unavailable.".to_string())?;
    if !navigation_allowed(WINDOW_LABEL, &url) {
        return Err("Chat acceptance navigation left the exact asset path.".into());
    }
    let at = w
        .inner_position()
        .map_err(|_| "Chat acceptance inner frame position is unavailable.".to_string())?;
    let size = w
        .inner_size()
        .map_err(|_| "Chat acceptance viewport is unavailable.".to_string())?;
    let scale = w
        .scale_factor()
        .map_err(|_| "Chat acceptance DPI is unavailable.".to_string())?;
    let mon = w
        .current_monitor()
        .map_err(|_| "Chat acceptance monitor is unavailable.".to_string())?
        .ok_or_else(|| "Chat acceptance monitor is unavailable.".to_string())?;
    let mp = mon.position();
    let ms = mon.size();
    let cx = at.x as i64 + size.width as i64 / 2;
    let cy = at.y as i64 + size.height as i64 / 2;
    if size.width == 0
        || size.height == 0
        || (scale - mon.scale_factor()).abs() > 0.001
        || cx < mp.x as i64
        || cy < mp.y as i64
        || cx >= mp.x as i64 + ms.width as i64
        || cy >= mp.y as i64 + ms.height as i64
    {
        return Err("Chat acceptance monitor and frame do not match.".into());
    }
    let window_id = native_id(w)?;
    let native_session_id = format!("process-{}", std::process::id());
    let viewport = Viewport {
        width: size.width as f64 / scale,
        height: size.height as f64 / scale,
    };
    let layout = Layout {
        observed_at: millis(),
        content_matches_window: true,
        window_id: window_id.clone(),
        native_session_id: native_session_id.clone(),
        compositor_size: [size.width as i32, size.height as i32],
        rect: Rect {
            x: 0.0,
            y: 0.0,
            width: viewport.width,
            height: viewport.height,
        },
        viewport,
        monitor_scale: scale,
    };
    Ok(Observation {
        id: RELEASE_ID,
        version: RELEASE_VERSION,
        sha256: RELEASE_SHA256,
        private: true,
        stage: "acceptance",
        window_label: WINDOW_LABEL,
        origin: ASSET_ORIGIN,
        url: url.to_string(),
        alive: true,
        process_id: std::process::id(),
        window_id,
        native_session_id,
        frame_id,
        navigation_id,
        asset_root: root.to_string_lossy().to_string(),
        workspace_id: 1,
        window_bounds: [at.x, at.y, size.width as i32, size.height as i32],
        layout,
    })
}
pub(crate) fn open(
    app: &tauri::AppHandle,
    runtime: SharedRuntime,
    base: &Path,
) -> Result<(), String> {
    if std::env::var("SHELL_CHAT_ACCEPTANCE_WINDOW").as_deref() != Ok("enabled") {
        return Err("Chat acceptance window requires the explicit development flag.".into());
    }
    if let Some(w) = app.get_webview_window(WINDOW_LABEL) {
        return w.set_focus().map_err(|e| e.to_string());
    }
    let root = verify_install(base)?;
    let url =
        tauri::Url::parse(&format!("{ASSET_ORIGIN}{ASSET_PATH}")).map_err(|e| e.to_string())?;
    let w = WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::External(url))
        .title("SHELL — Chat acceptance")
        .inner_size(1180.0, 820.0)
        .min_inner_size(760.0, 620.0)
        .resizable(true)
        .center()
        .build()
        .map_err(|e| e.to_string())?;
    let g = runtime
        .lock()
        .map_err(|_| "Chat acceptance runtime is unavailable.".to_string())?
        .begin(&w, &root)?;
    let er = runtime.clone();
    w.on_window_event(move |e| {
        if matches!(
            e,
            WindowEvent::Destroyed | WindowEvent::CloseRequested { .. }
        ) {
            if let Ok(mut s) = er.lock() {
                s.revoke(g)
            }
        }
    });
    let pw = w.clone();
    let pr = runtime.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_millis(250));
        if !pw.is_visible().unwrap_or(false) {
            if let Ok(mut s) = pr.lock() {
                s.revoke(g)
            }
            break;
        }
        let ok = pr
            .lock()
            .map_err(|_| ())
            .and_then(|mut s| s.refresh(g, &pw, &root).map_err(|_| ()));
        if ok.is_err() {
            let _ = pw.close();
            break;
        }
    });
    Ok(())
}
pub(crate) fn close(app: &tauri::AppHandle, runtime: SharedRuntime) -> Result<(), String> {
    if let Ok(mut s) = runtime.lock() {
        s.revoke_current()
    }
    if let Some(w) = app.get_webview_window(WINDOW_LABEL) {
        w.close().map_err(|e| e.to_string())?
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exact_navigation() {
        assert!(navigation_allowed(
            WINDOW_LABEL,
            &tauri::Url::parse("http://127.0.0.1:5984/__shell/chat-acceptance/web/index.html")
                .unwrap()
        ));
        for bad in [
            "http://127.0.0.1:5984/__shell/chat-acceptance/web/app.js",
            "http://127.0.0.1:5984/__shell/chat-acceptance/web/index.html?x=1",
            "https://127.0.0.1:5984/__shell/chat-acceptance/web/index.html",
        ] {
            assert!(!navigation_allowed(
                WINDOW_LABEL,
                &tauri::Url::parse(bad).unwrap()
            ))
        }
    }
    #[test]
    fn safe_paths() {
        let r = Path::new("C:/acceptance");
        assert!(safe_child(r, "web/index.html").is_some());
        assert!(safe_child(r, "../secret").is_none());
        assert!(safe_child(r, "C:/secret").is_none())
    }
    #[test]
    fn unavailable_runtime_fails() {
        let mut r = Runtime {
            generation: 1,
            current: None,
            revoked: false,
        };
        assert!(r.observe().is_err());
        r.revoke_current();
        assert!(r.observe().is_err())
    }
}
