# SHELL

This order establishes SHELL as an independent local-first operating environment. SHELL bundles released Contained Evolution Apps and owns FETCH, Research Labs, local data, optional cloud storage and sync, devices, windows, settings, and integrations. Tenari is optional. Utility ownership lives in the Apps repository; durable SHELL shape lives in the repository README; SEED has its own repository and order.

## Current implementation seam

The public standalone repository is `https://github.com/containedevolution-hue/SHELL`. It preserves the former `localhub/` history and owns the canvas, sidecar/local agent, Tauri wrapper, dedup engine, Flow prompts, Pi work, independent tests, licence, and CI. The extracted Node/security suite and Rust/Tauri checks run from that checkout. SHELL now publishes capability discovery contract v1 at its loopback-only `/v1/capabilities` endpoint and owns an MSI-targeted, runner-neutral VM profile, read-only host preflight, Linux user-service seam, and recovery gates. These are foundation contracts, not a built Linux image or hardware proof. Tenari's source-level copy has been removed. SHELL still contains recovered Tenari origins, account pairing, cloud registration, app-catalog assumptions, and compatibility names that must become an optional adapter or be retired; there is no SHELL-owned sync service, FETCH browser runtime, native window manager, SEED store, or bootable Linux image yet.

## Foundation contracts

**Repository.** SHELL lives in its own public repository with preserved `localhub/` history and a permissive licence. Tenari consumes released contracts and artifacts; neither repository imports the other's private source.

**Capability interface.** One versioned boundary covers apps, windows, local data, files, browser, assistant providers, sync, devices, settings, updates, and integrations. The Windows/Tauri bridge and Linux system session implement that boundary independently.

**Data and cloud.** SQLite is the first authoritative local store, with explicit namespaces and migrations per app. Optional SHELL Cloud sync and object storage are SHELL services. No Tenari account is required. Conflict, deletion, encryption, account-detach, and recovery behavior are defined before ordinary apps migrate.

**Tenari integration.** Tenari supplies the Companion, Stardust intelligence, autobiographical Memory, and Tenari World. It runs inside SHELL or on another supported OS. Inside SHELL it uses explicitly granted capabilities and can operate core apps without owning their data or cloud path.

**FETCH.** FETCH is the built-in browser and evidence-first research system. The visible browser, profiles, permissions, downloads, history, and Labs are SHELL-owned. The first runtime may embed Chromium; Chrome and Firefox remain installable alternatives.

**SEED.** SEED shares the local data substrate through a sealed namespace but never enters SHELL Cloud or an integration. Local inference uses the same local-model provider contract as the optional SHELL assistant.

**Brics.** The device contract covers discovery, power/data negotiation, configuration, diagnostics, firmware recovery, input, and future snap-in screen or robot-face modes. Brics remains its own product and repository.

**MSI-first OS path.** The MSI remains recoverable throughout development. Work begins in a VM, advances to live USB hardware proof, then to an isolated second internal or external SSD. Windows is not erased until install, update, rollback, recovery, graphics, networking, audio, suspend, camera, and input are proven on the real machine.

## Build order

1. **Complete the capability interface.** Discovery schema v1 and default-deny feature reporting are built. Add error semantics, permission receipts, compatibility policy, and independent Tauri and Linux-daemon adapters.
2. **Replace the recovered remote launcher.** Remove the hard-coded Tenari catalog and origin from the live canvas, discover released app manifests locally, and isolate optional Tenari pairing behind a versioned adapter. Recovered files under `legacy-tenari/` are evidence only and never a runtime dependency.
3. **Build the authoritative local data layer.** Replace the temporary local-doc and browser-local layout seams with SQLite namespaces, migrations, backup/restore, encryption boundaries, and an append-only SEED namespace.
4. **Build SHELL Cloud independently.** Add optional account, sync, encrypted object storage, detach, conflict, deletion, quota, and recovery behavior with no Tenari dependency.
5. **Build FETCH Browser.** Ship tabs, navigation, profiles, permissions, history, bookmarks, downloads, engine updates, sandboxing, and Research Labs over the shared browser/evidence boundary.
6. **Build the window and session model.** Add native-capable windows, focus, resize, saved placement, open-app controls, close-all recovery, and application lifecycle without assuming an iframe.
7. **Host Contained Evolution Apps local-first.** Use the extracted Scribble reference app, then integrate remaining released utilities through the shared app manifest and SHELL host adapter. Each works with no account and no Tenari; SHELL does not fork their implementation.
8. **Attach Tenari as an optional integration.** Prove install, use, capability grant/revoke, Companion app operation, Stardust, Memory, World entry, detach, and use on a non-SHELL OS.
9. **Stand up SEED.** Build its local corpus, capture, curation, datasets, lenses, feedback, and sealed operator surface under its own order.
10. **Integrate Brics.** Ship configuration and diagnostics first, then the snap-in display/robot-face contract against real hardware.
11. **Build the MSI development image.** Automate the Linux base, boot-to-SHELL session, drivers, updates, rollback, recovery, encryption, and developer tools. Prove the VM and live USB before installing to an isolated SSD.
12. **Finish the spatial desktop and Memory Tree.** Complete persisted bubbles, storage altitudes, artwork, custody views, offline behavior, and accessible desktop/phone layouts.
13. **Verify release layers honestly.** Automated tests, Tauri builds, Linux image builds, browser-engine security updates, real-browser screenshots, real MSI hardware exercises, cloud attach/detach, Tenari integration, Brics devices, and recovery are separate signals.

## Repository recovery boundary

- Preserve the complete extracted `localhub/` history in Git; do not recreate a source-level copy in Tenari.
- Keep SHELL-owned tests against public contracts; leave Tenari account, payment, World, and Companion implementation behind.
- Treat hard-coded Tenari origins, `/api/hub/*`, account pairing, tunnel registration, and the live Tenari catalog as adapters to separate, not foundational SHELL behavior.
- Publish frontend and protocol artifacts with explicit versions. Tenari may consume those artifacts but never reaches into the SHELL checkout.
- Do not claim the OS, browser, cloud, or hardware layers complete until their real layer has been exercised.

## Completion

Delete this order when the recovered remote launcher is gone, the standalone repository owns all remaining work, and Tenari contains only its integration obligations. Active MSI/device/cloud proof that cannot be deterministic belongs in Acceptance; completed attempts remain in Git.
