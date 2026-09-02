# SHELL

SHELL is Contained Evolution's free, local-first operating environment. It owns its desktop, core apps, FETCH browser and Research Labs, files, local data, optional cloud storage and sync, devices, settings, and integration permissions. It works without Tenari, an assistant, or an account.

This repository was extracted from Tenari with the complete history of the former `localhub/` subtree. Compatibility identifiers such as `localhub`, `hub_*`, `com.containedevolution.localhub`, and `localhub://` remain only where changing them requires a deliberate migration.

## Current state

- `web/` contains the always-on local canvas, draggable app bubbles and folders, drawer, local document browser, and offline recovery surface.
- `node-sidecar/` is the current local agent: data host, permission jail, audited file/browser tools, local Flow seam, and legacy Tenari pairing adapters.
- `src-tauri/` packages the Windows bridge and owns sidecar lifecycle, native commands, global shortcuts, and deep links.
- `dedup-engine/` is the Rust image-deduplication engine.
- `scripts/` provisions pinned build dependencies.
- `tests/` plus the sidecar tests cover the independent behavior that already exists.

The current code still contains legacy Tenari origins and pairing behavior. Those are extraction seams, not SHELL foundations. New work must place optional products behind versioned integrations and keep local features functional when every integration is absent.

## Product boundaries

- Local data is authoritative. Optional SHELL Cloud storage and sync belong to SHELL.
- FETCH is SHELL's browser and evidence-first research system. Its first engine may embed Chromium without requiring Chrome to be installed.
- SEED is a sealed, developer-only local corpus and never enters cloud sync or integration reach.
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
2. Separate legacy Tenari pairing/cloud behavior into an optional adapter.
3. Replace local-document and desktop-layout stand-ins with the authoritative SQLite data layer.
4. Establish the local [security and system-health service](docs/security-and-health-foundation.md).
5. Establish the MSI VM image and boot-to-SHELL Linux session.
6. Build FETCH Browser on an embedded engine boundary.
7. Add independent SHELL Cloud storage and sync.

See [the extraction manifest](docs/extraction-manifest.md) for current ownership and debt.
The executable discovery format is [capability contract v1](contracts/v1/capabilities.schema.json),
served locally at `GET /v1/capabilities`. The safe MSI VM and recovery path starts in
[SHELL OS](os/README.md). Security and performance observations use the versioned
[health-event contract](contracts/v1/health-event.schema.json).

## License

MIT. See [LICENSE](LICENSE).
