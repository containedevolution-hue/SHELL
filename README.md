# SHELL

SHELL — Secured, Home, Exported, Life, Logs — is Contained Evolution's free, local-first operating environment. It owns its desktop, FETCH browser and Research Labs, files, local data, optional cloud storage and sync, devices, settings, and integration permissions. It bundles cross-platform Contained Evolution Apps without owning or forking their canonical implementations. It works without Tenari, an assistant, or an account.

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
- FETCH is SHELL's browser and evidence-first research system. Its first engine may embed Chromium without requiring Chrome to be installed.
- SEED — Secured Environment Educated Development — is an opt-in plugin nested in Memory Box inside SHELL's Core: a sealed local corpus, curation, retrieval, dataset, backup, and restore feature for real users. It remains off by default, permission-gated, and outside cloud sync or implicit integration reach.
- Tenari is optional: Companion, Stardust intelligence, autobiographical Memory, and Tenari World. It may use explicitly granted SHELL capabilities but never owns SHELL data.
- Brics is a separate product with a first-class SHELL device, diagnostics, input, and snap-in display seam.

## MSI-first OS path

The first OS target is an MSI GF63 Thin 11UC with an Intel i5-11400H, 32 GB RAM, Intel/NVIDIA hybrid graphics, and UEFI Secure Boot. Development advances through:

1. A Linux virtual machine on the existing Windows installation.
2. A live USB hardware pass.
3. An isolated second internal or external SSD.
4. Primary-machine installation only after update, rollback, recovery, graphics, networking, audio, suspend, camera, and input are proven.

The Windows/Tauri build remains the recoverable bridge while the Linux session matures.

## Development

`npm run dev` and `npm run build` prepare the pinned starter catalog before Tauri starts. The build machine uses authenticated GitHub CLI access to the private Apps release, or `CE_APP_RELEASE_DIR` containing the already downloaded release. Each artifact is checked against `contracts/app-catalog.json`. End users need neither GitHub nor a source checkout: the package is included in the SHELL installer and Install copies it into their app directory without a network request.

The local `/v1/app-store` surface lists verified available releases. Installation requires the local SHELL/native origin and a per-process install token; only reviewed ids can be installed. Existing versions are preserved and updates remain unsupported. `/v1/apps` continues to own installed discovery and launch. Starter-catalog integrity failure does not disable existing apps.

The installer includes explicitly selected runtime resources and the verified catalog, excluding sidecar `data/`, credentials, and arbitrary working-directory files. The default Rust feature is the consumer profile, which leaves development asset-forge tools out of packaged runtime startup.

Run `npm run test:app-store` after Playwright browser setup for the empty-install-to-document flow; set `BROWSER_CHANNEL=msedge` to use installed Edge. Tests install into a disposable directory and use a fresh browser profile. The browser check proves the web surface and sidecar boundary, not a clean-machine Windows installer run or Linux release.

Install a reviewed local web app from its published v1 release and independently obtained SHA-256:

```powershell
node scripts/install-app.js PATH_TO_RELEASE.ceapp.json TRUSTED_SHA256
```

The destination defaults to `SHELL_APPS_DIR` or the sidecar's `data/apps`. Pass a third directory argument for an isolated installation. Existing installations are preserved. The registry rejects unsupported required capabilities and launches app-owned browser assets. Scribble 0.2.0 uses browser-local storage; native document custody, automatic updates, and publisher signatures remain future contracts. The release format belongs to Apps `contracts/v1/app-release.md`.

```powershell
npm ci
npm --prefix node-sidecar ci
npm test
```

Rust checks:

```powershell
cargo check --manifest-path dedup-engine/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

Run the Windows bridge after provisioning the bundled Node artifacts described in `scripts/fetch-node-binary.mjs`:

```powershell
npm run dev
```

## Near-term order

1. Freeze and version the capability interface.
2. Finish separating legacy Tenari pairing/cloud behavior into its own optional adapter module.
3. Replace local-document and desktop-layout stand-ins with the authoritative SQLite data layer.
4. Establish the local [security and system-health service](docs/security-and-health-foundation.md).
5. Establish the MSI VM image and boot-to-SHELL Linux session.
6. Build FETCH Browser on an embedded engine boundary.
7. Add independent SHELL Cloud storage and sync.
8. Expand the proven Scribble manifest host into signed package installation, update, rollback, and removal.

See [the extraction manifest](docs/extraction-manifest.md) for current ownership and debt.
The executable discovery format is [capability contract v1](contracts/v1/capabilities.schema.json),
served locally at `GET /v1/capabilities`. The safe MSI VM and recovery path starts in
[SHELL OS](os/README.md). Security and performance observations use the versioned
[health-event contract](contracts/v1/health-event.schema.json).

## License

MIT. See [LICENSE](LICENSE).
