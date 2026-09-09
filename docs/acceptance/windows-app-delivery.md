# Windows App Delivery Acceptance

Covers the Windows bridge and the three public Apps releases (Scribble/Notes/Canvas) on the MSI — not SHELL OS or the private Chat native desk.

**Built:**
- A Windows NSIS installer built and passed: bundled Node loaded native addons, an isolated sidecar ran with a disposable data directory, refreshed and verified the public catalog, installed and discovered all three apps, and served checked web assets with no cross-origin leakage
- Native install/open/edit/persist proven on the MSI: Scribble/Notes/Canvas installed via the native WebView, and a document retained its content across a full process/sidecar restart, and again after the same installer completed a clean current-user install
- An observed environment noted: a hosted (Codex) Windows session redirects local install into its package's LocalCache directory rather than the installer's reported path — this acceptance covers that specific environment

**Not built yet:**
- An ordinary Windows user session outside the hosted package, and a clean-machine install/uninstall pass
- Physical-phone browser/home-screen installation and reopen; mobile viewport and touch tests
- A genuine newer published app release (current tests use test-only next versions); rollback UI; cross-device document sync
