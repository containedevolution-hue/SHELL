# Chat Slice 3: Hyprland Test Session

A planned separate Hyprland login/test session on the physical HP to qualify Chat's native-desk capability comparison, preserving the working KDE/Arch recovery session throughout.

**Built:**
- A read-only identity collector implemented and run (on Windows, correctly reporting unavailable with no Linux compositor connected): captures `hyprctl` version/monitors/clients plus `/proc` identity with no titles, command-lines, or credentials, and never changes registry/provider/session/compositor state
- A procedure specified: preserve the HP's working KDE session and take a physical recovery checkpoint before any change; add a distinct `SHELL Chat Test (Hyprland)` login entry (only the explicit `legacy-0.55` Hyprland profile is supported); prove login/logout returns cleanly to KDE before using it for Chat
- A full capability-comparison exercise matrix specified: attach/switch/reattach, focus/keyboard, standalone/return, close/detach, reopen/restart, provider restart, compositor timeout, move/resize/mixed-DPI, crash recovery, suspend/resume/logout, reduced motion — each with its required proof

**Not built yet:**
- Actually running any of this on the HP's real Hyprland session — no HP connection, Hyprland session, or provider identity has been observed yet in this pass
- The native attachment requirements this depends on (a canonical Chat artifact, authenticated Tauri transport, a trusted measured slot, native lifecycle callbacks) — implemented for the in-process bridge, not for the live producers
- A full outside/inside capability comparison per real provider, and the reviewed production registry entry that would follow it
