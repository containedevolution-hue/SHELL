# Chat Native Desk

Chat is the owner's lab; provider applications are complete native clients working inside it, never recreated, embedded, cropped, or proxied.

**Built:**
- Slot model decided: Shell reserves one visible native window slot in the Chat layout; only one provider client occupies it at a time; switching parks (never terminates) the previous client; closing Chat detaches/parks every client without killing the provider process
- A capability rule set as a release gate: a client enters the slot only if Shell can present the complete app with no capability loss versus running it standalone
- A troubleshooting escape hatch designed: Open app separately / Return to Lab, reporting only observed facts (found/running/attached/permissions/continuity), never inferring account identity or performing repairs
- Slice 3 foundation implemented: a trusted registry loader with exact class/`/proc` identity verification, a process-start-bound session id, serialized mutations, park-not-close behavior, and uncertain-result blocking; the Hyprland adapter selects only by compositor address with no close/kill/credential/URL operation
- An authenticated in-process bridge implemented, binding one exact native peer and Chat process/window identity with fresh geometry validation
- A private disposable Chat `0.1.0-dev` acceptance artifact and its Windows Rust-driver geometry sampling implemented, revoking on navigation/destruction/hiding/stale-geometry/monitor-mismatch
- A Windows backend boundary implemented: registration by package-family name/AUMID/relative executable/window class, bound to pid/start-time/HWND, minimize/restore/place/focus only, denying elevated/foreign-desktop windows

**Not built yet:**
- Live placement proof on a real Hyprland session: registered app attach, atomic batch/recovery, same-window reattachment, multi-monitor coordinates, focus recovery, provider/Chat crash-restart, logout/suspend/resume, reduced-motion behavior, side-by-side capability comparison
- Windows provider acceptance: exact package/window identity review into the registry, physical mixed-DPI/multi-monitor placement, OS focus behavior, package-update/restart handling, crash recovery, remote-session survival, side-by-side comparison
- The production provider registry remains empty on both platforms; the manager reports unavailable until these gates pass
