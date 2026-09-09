# SHELL

Contained Evolution's free, local-first operating environment: owns its desktop, adaptive Status Bar, native browser-engine and filesystem capabilities, devices, settings, windows, automation, and integration permissions. Works without Tenari, an assistant, or an account.

**Built:**
- Extracted into its own repository with full `localhub/` history; local app discovery/launch work with every integration absent; legacy Tenari pairing exists only as a disabled adapter seam
- Product boundaries decided: Apps owns CE Account/cloud sync and general utility apps including Chat; SEED is hosted through Memory Box, off by default; Tenari and Brics are optional integrations that never own SHELL data
- App delivery implemented: consumes the CE Apps catalog, bundles a verified offline snapshot, and installs/updates reviewed packages (Scribble/Notes/Canvas current) with atomic verified staging and no account requirement
- A Windows build pipeline implemented and verified (see `docs/acceptance/windows-app-delivery.md`): a pinned Node fetch, an NSIS installer, a disposable-profile app-store test suite, and a direct install script
- A Linux build pipeline implemented: a pinned Node fetch, an AppImage bundle target, host-native sidecar dependency staging, and a Chromium-based browser-app test path

**Not built yet:**
- The near-term order: freeze/version the capability interface, finish isolating legacy Tenari pairing/cloud behavior, replace local-doc stand-ins with the authoritative SQLite layer, stand up the local security/health service, build the MSI VM boot-to-SHELL session, build FETCH Browser on an embedded engine, add independent SHELL Cloud sync, publish the narrow Status Bar/native-desk/remote-continuity/receiving capabilities Chat needs, and expand app updates into publisher signatures/rollback/removal
