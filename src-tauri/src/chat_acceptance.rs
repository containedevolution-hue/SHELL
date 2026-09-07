//! Fixed identity and lifecycle rules for the private Chat acceptance window.
//! This module creates no window and grants no page-visible command.

#![allow(dead_code)]

const WINDOW_LABEL: &str = "chat-acceptance";
const RELEASE_ID: &str = "chat";
const RELEASE_VERSION: &str = "0.1.0-dev";
const RELEASE_SHA256: &str = "2261aba0f5a2b8d79339d5072e992c7457c7a9e9ce8139e5c3246a804ff4d1b7";
const ASSET_PREFIX: &str = "/__shell/chat-acceptance/";

pub(crate) fn navigation_allowed(label: &str, url: &tauri::Url) -> bool {
    if label != WINDOW_LABEL {
        return true;
    }
    url.scheme() == "http"
        && url.host_str() == Some("127.0.0.1")
        && url.port() == Some(5984)
        && url.path().starts_with(ASSET_PREFIX)
        && url.query().is_none()
        && url.fragment().is_none()
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct WindowProof {
    release_id: String,
    version: String,
    sha256: String,
    label: String,
    process_id: u32,
    window_id: String,
    native_session_id: String,
    frame_id: String,
    navigation_id: String,
    alive: bool,
}

struct Authority {
    initial: WindowProof,
    revoked: bool,
}
impl Authority {
    fn bind(proof: WindowProof) -> Result<Self, String> {
        if !valid(&proof) {
            return Err("Canonical Chat acceptance identity is unavailable.".into());
        }
        Ok(Self {
            initial: proof,
            revoked: false,
        })
    }
    fn observe(&mut self, proof: &WindowProof) -> Result<(), String> {
        if self.revoked || !valid(proof) || proof != &self.initial {
            self.revoked = true;
            return Err(
                "Canonical Chat acceptance process, window, frame, or navigation changed.".into(),
            );
        }
        Ok(())
    }
}
fn valid(value: &WindowProof) -> bool {
    value.release_id == RELEASE_ID
        && value.version == RELEASE_VERSION
        && value.sha256 == RELEASE_SHA256
        && value.label == WINDOW_LABEL
        && value.process_id > 0
        && !value.window_id.is_empty()
        && !value.native_session_id.is_empty()
        && !value.frame_id.is_empty()
        && !value.navigation_id.is_empty()
        && value.alive
}

#[cfg(test)]
mod tests {
    use super::*;
    fn proof() -> WindowProof {
        WindowProof {
            release_id: RELEASE_ID.into(),
            version: RELEASE_VERSION.into(),
            sha256: RELEASE_SHA256.into(),
            label: WINDOW_LABEL.into(),
            process_id: 7,
            window_id: "window-7".into(),
            native_session_id: "process-7-start".into(),
            frame_id: "frame-1".into(),
            navigation_id: "navigation-1".into(),
            alive: true,
        }
    }
    #[test]
    fn exact_navigation_has_no_query_fragment_or_foreign_origin() {
        assert!(navigation_allowed(
            WINDOW_LABEL,
            &tauri::Url::parse("http://127.0.0.1:5984/__shell/chat-acceptance/web/index.html")
                .unwrap()
        ));
        assert!(!navigation_allowed(
            WINDOW_LABEL,
            &tauri::Url::parse(
                "http://127.0.0.1:5984/__shell/chat-acceptance/web/index.html?token=x"
            )
            .unwrap()
        ));
        assert!(!navigation_allowed(
            WINDOW_LABEL,
            &tauri::Url::parse("https://example.com/__shell/chat-acceptance/web/index.html")
                .unwrap()
        ));
        assert!(navigation_allowed(
            "main",
            &tauri::Url::parse("https://example.com/").unwrap()
        ));
    }
    #[test]
    fn process_window_frame_navigation_and_liveness_changes_revoke() {
        let initial = proof();
        let mut authority = Authority::bind(initial.clone()).unwrap();
        authority.observe(&initial).unwrap();
        let mut changed = initial;
        changed.frame_id = "frame-2".into();
        assert!(authority.observe(&changed).is_err());
        assert!(authority.revoked);
        assert!(authority.observe(&proof()).is_err());
    }
}
