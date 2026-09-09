# Native Desktop and Files

The first native desktop slice (seed/Core design) running in the existing Tauri host, enabled with `SHELL_DESKTOP=enabled`.

**Built:**
- The native desktop opens with the Home globe and Core seed; Home never terminates external apps
- Core → Files reads the user's Home/Documents/Downloads/Pictures, plus an owner-added folder for the process lifetime — no assistant/MCP/app/HTTP access is granted by this
- Files provides folder/breadcrumb navigation, path entry within admitted roots, refresh, hidden files, filtering, size/modification time, and handoff of supported files to the default app — read-only, no create/rename/move/delete, no script/executable launch
- Apps opens the existing native launcher (still sidecar-dependent, no new package discovery); Settings routes to KDE/Windows native settings
- The native boundary is enforced: exact WebView label/origin verification, no external navigation, no new sidecar file endpoint, canonicalized/traversal-safe root paths, bounded directory listing (5,000 entries) off the UI thread
- Windows development build and browser preview verified end to end: real fixture files listed, folder/parent navigation, hidden-file visibility, metadata, default-app handoff, executable-launch refusal, cross-window command isolation, and full repository/Rust test suites passing
- The HP development install path is documented and run (a checkout-backed dev build via `--no-bundle`, not a portable package)

**Not built yet:**
- Acceptance still owed on HP: the release build opening from the KDE launcher without a preview terminal, a full Files navigation/metadata/open-in-default-app exercise, folder-picker behavior, the Desktop Settings/Apps sidecar check, and close/reopen plus full-reboot persistence
- The Unix-only escaped-symlink test (still needs a real Linux run)
- AppImage assembly, independent Shell login, native Linux window management, file mutations, and cross-application Status Bar contributions
