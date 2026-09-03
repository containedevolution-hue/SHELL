# Handoff: SHELL naming consolidation — SHELL repo + Brics repo half

**From:** Claude (owns the Tenari-repo half, already committed + pushed)
**To:** Codex
**Scope:** stale and dangling *documentation/comment* references only. Do **not**
attempt the full "Command Center -> SHELL" product rename — that is a separate,
gated effort owned by `Tenari/memory/ledger/build-orders/SHELL-Naming-Consolidation.md`.

---

## Background (what's going on)

"Command Center", "Cyclone", "localhub", and "SHELL" are the same product at
different layers and naming eras:

- **SHELL** is the current customer-facing name for Contained Evolution's free
  local-first OS / core-app platform. Canon prose already says "SHELL".
- **Command Center** is the retired name for its desktop/appliance surface.
  Still present on purpose in user-facing strings + a test (`command-center-unification.test.js`)
  until Chris greenlights the rename.
- **Cyclone** was the codename for the sync engine / tunnel C-numbers.
- **localhub** is the code. It lives in the standalone repo
  `github.com/containedevolution-hue/SHELL` (authoritative) **and** as a
  temporary copy at `Tenari/localhub/` (Tenari's build still imports it).
- **SEED** = *Secured Environment Educated Development* — a sealed, developer-only
  capture/curation corpus that is a component of SHELL.

Claude has already, in the **Tenari repo** (pushed to `main`, commit
`Own the Command Center -> SHELL rename in one build order`):
- added `memory/ledger/build-orders/SHELL-Naming-Consolidation.md` (the full
  rename plan + gate),
- pointed `SHELL.md` step 2 at it,
- rewrote `Tenari/localhub/README.md` as a pointer to the SHELL repo.

**Do not touch the Tenari repo.** If you spot something there, note it back to
Chris; don't edit it.

---

## Your half — exact changes

### Repo A: SHELL — `C:\Users\conta\SHELL` (github: containedevolution-hue/SHELL, MIT)

All four edits are **doc/comment only**. Do not rename user-facing surface
strings, page `<title>`s, or MCP tool descriptions — those are gated.

**A1. `README.md` — spell out both acronyms** (canon: `Tenari/memory/platform/Brand-and-Naming.md`).

- Line 3, change:
  `SHELL is Contained Evolution's free, local-first operating environment.`
  to:
  `SHELL — Secured, Home, Exported, Life, Logs — is Contained Evolution's free, local-first operating environment.`
- The SEED bullet (currently `- SEED is a sealed, developer-only local corpus and never enters cloud sync or integration reach.`), change to:
  `- SEED — Secured Environment Educated Development — is a sealed, developer-only local corpus that never enters cloud sync or integration reach.`

**A2. `node-sidecar/README.md` — retitle + fix dangling link.**
- Line 1: `# Command Center Node Sidecar` -> `# SHELL Node Sidecar`
- Line 4 currently references `../../memory/command-center/Tenari-Command-Center.md`
  — **that path does not exist in this repo.** Replace the whole line with:
  `Part of the SHELL local agent — see [`../docs/extraction-manifest.md`](../docs/extraction-manifest.md).`
  (Drop the "Cyclone C2b deliverable" framing.)

**A3. `node-sidecar/pi/README.md` — retitle + fix dangling link.**
- Line 1: `# Command Center — Pi bring-up` -> `# SHELL — Pi bring-up`
- Line 3: `Tier 0 Pi 5 Command Center` -> `Tier 0 Pi 5 SHELL appliance`
- Line ~14 references `memory/command-center/Tenari-Command-Center.md` — repoint
  to `../../README.md` (this repo's README).
- Leave every `setup-*.sh` script, systemd unit description, and
  `setup-cyclone6-tunnel.sh` **untouched** (gated rename).

**A4. `src-tauri/src/main.rs` — line 2 comment.**
- `// (memory/command-center/Tenari-Command-Center.md).` -> `// (see docs/extraction-manifest.md).`
- Comment only; do not touch code.

**Verify (SHELL repo):**
```powershell
cd C:\Users\conta\SHELL
npm ci ; npm --prefix node-sidecar ci
npm test
cargo check --manifest-path dedup-engine/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```
Then commit (scoped message, e.g. "Fix dangling command-center doc links, spell
out SHELL/SEED acronyms") and push `main`.

---

### Repo B: Brics — `C:\Users\conta\Brics` (github: containedevolution-hue/Brics)

The Brics tree is **clean** (Claude already committed + pushed the
office-assistant-rover work). Two files only.

**B1. `hardware/ARCHITECTURE.md`** — line ~22:
- `...not a PWA-only product and not a Command Center window.`
  -> `...not a PWA-only product and not a SHELL window.`
- Leave line 24 ("bundled local Home dashboard") as-is unless it's obviously
  wrong — "Home" there is Brics's own local dashboard, not Tenari's Home app.

**B2. `research/Perception-Compute.md`** — the paragraph near line 84:
- `There is a related Contained Evolution developer-side system, SEED, in the Tenari repository that shares...`
  -> `There is a related Contained Evolution developer-side system, SEED — a sealed developer-only component of the SHELL platform — that shares...`
- Keep the rest of the sentence (SCRIBE independence) unchanged.

**Constraint:** Brics `AGENTS.md` requires Brics stay independent from Tenari —
terminology fixes only, do **not** copy any Tenari/SHELL Memory content in.

**Do NOT touch** in Brics: `hardware/office-assistant-rover/`,
`memory/ledger/build-orders/Office-Assistant-Rover.md`,
`memory/ledger/build-orders/SCRIBE.md`, `memory/00-Brics.md`,
`memory/ledger/build-orders/Modular-Robot.md` — already committed, not part of
this cleanup.

**Verify (Brics):**
```powershell
cd C:\Users\conta\Brics
npm test
```
Then commit. End the commit message with:
`Co-Authored-By: <your attribution>`
and push `main`.

---

## Out of scope for both of us (owned by SHELL-Naming-Consolidation.md, gated on Chris)

- Renaming "Tenari Command Center" -> "SHELL" in user-facing HTML, download
  pages, portal pages, `lib/capability-registry.js`, `lib/guide-tool-index.js`,
  `lib/appliance-mcp.js`, MCP tool descriptions, or the two privacy policies.
- Renaming `setup-cyclone6-tunnel.sh` / the `Cyclone C2.x` Cargo comments.
- Touching `com.containedevolution.localhub` / `localhub://` (frozen bundle id).
- Deleting `Tenari/localhub/` or rewiring `scripts/build-tool-reference.js`.
- Renaming the `memory/command-center/` folder.

If you finish your half and want to keep going, add findings to
`SHELL-Naming-Consolidation.md` rather than starting the gated work.
