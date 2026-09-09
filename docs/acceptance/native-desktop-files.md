# Native desktop and Files

The first native desktop slice runs the seed/Core design in the existing Tauri host. It is enabled with `SHELL_DESKTOP=enabled`. The same frontend is served by the browser design preview, which has no filesystem access. The frontend source now lives in `web/desktop/`; the old `design/desktop/index.html` link forwards there.

## Working scope

- The native desktop opens with the fixed Home globe and Core seed. Home changes the visible Shell page without terminating external applications.
- Core → Files reads the current user's Home, Documents, Downloads and Pictures where present. The owner can use the native Add folder picker to add another location for this process lifetime. This does not grant an assistant, MCP client, app package or HTTP caller access.
- Files provides folder and breadcrumb navigation, direct path entry within admitted roots, parent navigation, refresh, hidden files, filtering the current listing, file size and modification time, and explicit handoff of supported documents/media to the default application.
- Files is read-only inside Shell. There are no create, rename, move or delete controls. The default application may edit a file after the owner opens it. Scripts, executables, HTML, special files and unsupported extensions cannot be launched through Files.
- Apps opens the existing native Shell application launcher. Installed-app operations still depend on the sidecar; this slice does not add Linux package discovery or a new application store.
- Desktop/Core Settings opens KDE System Settings on Linux or Windows Settings on Windows. Files Settings remains local to the file view. Connections, Memory Box, system activity and notification feeds still report unavailable.
- Closing the desktop exits this Shell process. Closing its app launcher hides that window so Apps can reopen it. Already launched external applications remain separate processes.

## Native boundary

Every new operation verifies the exact `desktop` WebView label and bundled `/desktop/index.html` origin/path. The desktop refuses external navigation. No file read/open endpoint is added to the sidecar. Root paths and requests are canonicalized; lexical traversal and symlinks escaping admitted roots fail closed. Missing paths and access denial remain errors. Directory reading runs off the UI thread and is bounded at 5,000 entries with a visible truncation notice. Older asynchronous UI results cannot replace a newer directory request.

## HP development installation

Use the existing HP checkout after checking its branch and preserving any local edits. The HP already has the recorded Rust/GTK/WebKit/xdotool build prerequisites. No partition, boot-entry, firewall or login-session changes are required here.

```bash
git -C ~/SHELL status --short --branch
```

With the checkout clean on main:

```bash
git -C ~/SHELL pull --ff-only
cd ~/SHELL
npm run build -- --no-bundle
npm run install:desktop
```

Run each command only after the previous one succeeds. `--no-bundle` builds the native executable and stages its resources while skipping the still-unresolved AppImage wrapping step. It is a checkout-backed development build, not a portable package and not proof that AppImage assembly is repaired.

Open **SHELL Desktop (Development)** in KDE's application launcher. The per-user launcher points to the executable in this checkout; keep that directory in place. `npm run start:desktop` starts the same release executable from a terminal. `npm run dev:desktop` compiles and runs the development profile for rapid iteration.

Before rebuilding an existing native desktop, close its window. A successful rebuild at the same path updates the launcher; it does not require another launcher installation. Keep KDE as the normal session.

## Verification on the MSI (2026-09-09)

Verified from an isolated checkout containing only this change over `5beaaf93`, preserving unrelated product edits in the active checkout:

- `npm test`: 153 tests passed, including the per-user launcher installer checks.
- `cargo test --manifest-path src-tauri/Cargo.toml`: all 15 Windows-host tests passed. The Unix-only escaped-symlink test still requires a Linux run.
- Native debug build and actual WebView: the sidecar booted, Core listed real fixture files, folder/parent navigation and hidden-file visibility worked, metadata matched disk, a text file was handed to its default application, an executable was refused, another bundled window was denied desktop commands, and Home returned to the desktop.
- Apps opened the native application launcher and reopened it after its window was closed. Closing the desktop exited Shell successfully and stopped its sidecar.
- Browser preview: Desktop/Core/Files/Home routing, contextual settings, search, Escape focus, centered Home, responsive layouts at 320/390/768/1440 pixels, reduced motion and restricted preview routes passed without browser errors.

These checks qualify the Windows development build and browser preview. They do not qualify the HP release executable, its native picker, KDE integration or AppImage assembly.

## Acceptance still owed on HP

- Build the release executable on Arch with `--no-bundle`; confirm it opens from the KDE launcher without Chromium or a preview terminal.
- Open Core → Files; browse a known folder, navigate into/out of a subfolder, filter, show hidden files, inspect metadata and open a harmless text/image file in its default app.
- Add a folder through the native picker; confirm cancelled selection changes nothing and only the chosen location becomes available.
- Check Desktop Settings opens the HP's existing KDE settings. Open Apps and verify its sidecar-backed discovery. Return Home without closing a launched external app.
- Close/reopen Shell, then reboot the HP and launch it again. Added folders are session-only; source files remain in place.
- AppImage assembly, independent Shell login, native Linux window management, file mutations, and cross-application Status Bar contributions remain separate work.
