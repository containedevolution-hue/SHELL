# SHELL

SHELL — Secured, Home, Exported, Life, Logs — is Contained Evolution's free, local-first operating environment. It owns its desktop, adaptive Status Bar, FETCH browser and Research Labs, files, local data, optional cloud storage and sync, devices, settings, windows, automation execution, and integration permissions. It bundles cross-platform Contained Evolution Apps without owning or forking their canonical implementations. It works without Tenari, an assistant, or an account.

This repository was extracted from Tenari with the complete history of the former `localhub/` subtree. Compatibility identifiers such as `localhub`, `hub_*`, `com.containedevolution.localhub`, and `localhub://` remain only where changing them requires a deliberate migration.

## Current state

- `web/` contains My apps and Contained Evolution Apps. Users install reviewed packages from the bundled starter collection, then open installed versioned apps.
- `node-sidecar/` is the current local agent: data host, permission jail, audited file/browser tools, local Flow seam, and legacy Tenari pairing adapters.
- `src-tauri/` packages the Windows bridge and owns sidecar lifecycle, native commands, global shortcuts, and deep links.
- `dedup-engine/` is the Rust image-deduplication engine.
- `scripts/` provisions pinned build dependencies.
- `tests/` plus the sidecar tests cover the independent behavior that already exists.

Legacy Tenari pairing code remains as a disabled adapter seam. It performs no registration, beacon, or certificate work unless `SHELL_TENARI_INTEGRATION=enabled` is set explicitly. Local app discovery and launch work while every integration is absent.

## Product boundaries

- Local data is authoritative. Optional SHELL Cloud storage and sync belong to SHELL.
- General-purpose utilities are Contained Evolution Apps. SHELL discovers released app manifests and supplies a local host adapter; app behavior, portable data models, and releases stay with each app.
- Chat is the neutral, independently installable conversation home owned by Apps. SHELL will launch the canonical Chat release, supply the adaptive Status Bar and bounded host capabilities, and provide Chat's one-slot [native desk](docs/surfaces/Chat-Native-Desk.md). Slice 3 has a default-off trusted registry, controller, Hyprland adapter, authenticated in-process bridge, and native geometry validator. No provider is registered; the canonical Chat launcher, Tauri IPC wiring, live geometry producer, and hardware acceptance remain pending. The accepted desk will summon and switch complete downloaded provider applications without replacing them, preserve remote execution, and never become a Shell-specific Chat fork.
- FETCH is SHELL's browser and evidence-first research system. Its first engine may embed Chromium without requiring Chrome to be installed.
- SEED — Secured Environment Educated Development — is an independently owned, opt-in local capability hosted through Memory Box inside SHELL's Core. Its corpus, curation, retrieval, dataset, backup, and restore remain off by default, permission-gated, and outside cloud sync or implicit integration reach. Chat's Seed Station is the primary planned human control surface; Shell owns local execution, receiving, staging, permissions, and storage rather than a competing SEED conversation surface.
- Tenari is optional: Companion, Stardust intelligence, autobiographical Memory, and Tenari World. It may use explicitly granted SHELL capabilities but never owns SHELL data.
- Brics is a separate product with a first-class SHELL device, diagnostics, input, and snap-in display seam.

## MSI-first OS path

The first OS target is an MSI GF63 Thin 11UC with an Intel i5-11400H, 32 GB RAM, Intel/NVIDIA hybrid graphics, and UEFI Secure Boot. Development advances through:

1. A Linux virtual machine on the existing Windows installation.
2. A live USB hardware pass.
3. An isolated second internal or external SSD.
4. Primary-machine installation only after update, rollback, recovery, graphics, networking, audio, suspend, camera, and input are proven.

The Windows/Tauri build remains the recoverable bridge while the Linux session matures.

## App delivery

Contained Evolution Apps in SHELL offers Scribble 0.2.0, Notes 0.1.0, and Canvas 0.1.0 from the pinned starter catalog in `contracts/app-catalog.json`. Install copies the selected verified release into the local app directory without an account or network request; My apps then opens the installed browser entrypoint. The general installer can also accept explicitly selected compatible artifacts. Adding an app to the Apps repository does not add it to this starter catalog automatically.

`/v1/app-store` owns catalog discovery and installation. A browser installation requires a local SHELL/native origin and a per-process install token; only reviewed ids can be installed. `/v1/apps` owns installed discovery and launch. Existing versions are preserved, and a broken starter catalog does not disable installed apps. Updates, rollback, removal, publisher signatures, native document custody, and cloud sync remain unsupported by this delivery profile.

The prototype hosts trusted app packages on the sidecar origin. It does not establish a third-party app sandbox. Manifest capability checks describe compatibility, not isolation from every other same-origin sidecar endpoint.

## Build and verification

```powershell
npm ci
npm --prefix node-sidecar ci
node scripts/fetch-node-binary.mjs
npm test
npm run build
```

`npm run dev` and `npm run build` prepare the catalog before Tauri starts. The build machine needs authenticated GitHub CLI access to the private Apps releases, or `CE_APP_RELEASE_DIR` containing all selected release artifacts. The preparation script verifies the pinned digest and identity; end users need neither GitHub nor a source checkout.

The Windows consumer build includes selected runtime resources and the verified catalog. Sidecar `data/`, user credentials, and arbitrary working-directory files are excluded. Development asset-forge tools are not loaded by the consumer profile. `npm run build` produces the NSIS installer under `src-tauri/target/release/bundle/nsis/`.

`npm run test:app-store` verifies an empty installation through catalog, Install, Open, save, and reopen for all three apps in a disposable directory/browser profile. It also verifies Notes/Canvas export and reimport and preserves each app's data while switching apps, with external network requests blocked. Install Playwright's Chromium first, or set `BROWSER_CHANNEL=msedge` to use installed Edge. The application and installer compile; clean-machine Windows installation and Linux packaging still require separate proof.

On Linux with system Chromium installed, run
`BROWSER_EXECUTABLE_PATH=/usr/bin/chromium npm run test:app-store` after preparing
the catalog. An explicit executable path takes precedence over `BROWSER_CHANNEL`.
This verifies the browser app host; it does not verify a native Linux SHELL build.

For persistent manual use after catalog preparation, run `npm run start:apps`
and open `http://127.0.0.1:5984` in Chromium. Keep the terminal running. This
loopback-only app host uses the same routes and web surface as the browser test.
Installed packages persist in `node-sidecar/data/apps` (or `SHELL_APPS_DIR`).
Documents persist in the browser profile; use the same profile and exact URL
when reopening, and export documents for portable backups. The host does not
start the full sidecar, install a system service, or provide native Linux SHELL.
Stop it before starting another host that uses port 5984.

Rust-only checks use `cargo check --manifest-path dedup-engine/Cargo.toml` and `cargo check --manifest-path src-tauri/Cargo.toml`.

For direct installation of a reviewed artifact:

```powershell
node scripts/install-app.js PATH_TO_RELEASE.ceapp.json TRUSTED_SHA256
```

The destination defaults to `SHELL_APPS_DIR` or the sidecar's `data/apps`; a third directory argument selects an isolated destination. All three installed apps use browser-local storage. Apps `contracts/v1/app-release.md` owns the release format.

## Near-term order

1. Freeze and version the capability interface.
2. Finish separating legacy Tenari pairing/cloud behavior into its own optional adapter module.
3. Replace local-document and desktop-layout stand-ins with the authoritative SQLite data layer.
4. Establish the local [security and system-health service](docs/security-and-health-foundation.md).
5. Establish the MSI VM image and boot-to-SHELL Linux session.
6. Build FETCH Browser on an embedded engine boundary.
7. Add independent SHELL Cloud storage and sync.
8. Publish and prove the narrow Status Bar, native-desk, remote-continuity, and receiving capabilities required by Chat without moving Chat or SEED ownership into SHELL.
9. Expand the proven Scribble manifest host into signed package installation, update, rollback, and removal.

See [the extraction manifest](docs/extraction-manifest.md) for current ownership and debt.
The executable discovery format is [capability contract v1](contracts/v1/capabilities.schema.json),
served locally at `GET /v1/capabilities`. The safe MSI VM and recovery path starts in
[SHELL OS](os/README.md). Security and performance observations use the versioned
[health-event contract](contracts/v1/health-event.schema.json).
The accepted adaptive system surface is defined by [Status Bar](docs/surfaces/Status-Bar.md).
Chat's accepted complete-application window model is defined by [Chat native desk](docs/surfaces/Chat-Native-Desk.md) and its [version-2 host contract](contracts/chat/README.md).

## License

MIT. See [LICENSE](LICENSE).
