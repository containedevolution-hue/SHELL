# Windows app delivery acceptance

Verified on the MSI GF63 Thin 11UC on 2026-09-07. This covers the Windows bridge and the three public Apps releases, not SHELL OS or the private Chat native desk.

## Build

- Shell source: `9df06f86d3b88a66da955f5f337132c6e7717910`.
- `npm test`: 151 passed. `npm run build`: successful Windows NSIS bundle.
- Installer: `src-tauri/target/release/bundle/nsis/SHELL_0.1.1_x64-setup.exe`, 30,014,478 bytes.
- Installer SHA256: `6ff6286ec961868a8476b299dadfb4428aca26997ace50680cc4bfaaa9f7f510`.
- Installed/extracted executable SHA256: `8884a4462b778f33e7580cd9c5732f0e59b6fbdedfea6c84f3e043cb143ca4ed`. Compare against installer contents, since Tauri patches bundle type information during packaging.

## Passed

The installer was extracted with 7-Zip. Packaged Node 24.18.0 loaded both Windows x64 native addons and persisted a disposable PouchDB document through close/reopen. No sidecar user data or foreign-platform native addons were bundled.

The complete extracted consumer sidecar ran with an isolated data directory and disposable port. It refreshed the canonical public catalog, verified all three pinned artifacts, installed each app, discovered installed apps, and served nine checked web assets byte-for-byte. An unrelated loopback page origin remained forbidden. Isolated Edge exercised save, switch, and reopen for Scribble, Notes, and Canvas with zero page errors or external browser requests.

The extracted native executable then ran on the MSI. Its authenticated native Install controls installed Scribble 0.2.0, Notes 0.1.0, and Canvas 0.1.0. All three opened in the native WebView. A Scribble document created and edited through Windows input retained its title and exact content after the native process and its sidecar exited and restarted.

The same verified NSIS installer completed with exit code 0 in current-user mode. The installed executable matched the extracted executable, retained exactly the two Windows native addons, discovered the same three installed apps, and reopened that Scribble document with its saved content intact.

The Codex Windows host redirects local application installation into its package's `LocalCache/Local/SHELL` directory, although the installer reports `%LOCALAPPDATA%/SHELL`. This acceptance covers that observed environment. It does not establish an ordinary Start-menu installation outside the packaged host or a clean-machine installation.

## Remaining acceptance

- An ordinary Windows user session outside the Codex package and a clean-machine install/uninstall pass.
- Physical-phone browser/home-screen installation and reopen. Mobile viewport and touch browser tests are separate evidence.
- A genuine newer published app release: current update preservation tests use test-only next versions. Rollback UI and cross-device document synchronization remain unsupported.

The existing development WebView at `127.0.0.1:1430` received the expected 403 from app-store discovery because it was neither the native asset origin nor the standalone sidecar origin. Acceptance used the packaged native asset origin; origin and local-auth boundaries were not relaxed. Catalog failures now expose a dedicated retry control without disabling installed apps.
