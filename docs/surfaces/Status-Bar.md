# Status Bar

Shell's persistent, adaptive system surface — comparable in persistence to a taskbar but not in behavior; its visible controls change with the active surface and Core settings.

**Built:**
- An ownership model decided: Shell owns the bar, its state, permissions, alerts, and contribution contract; apps contribute bounded actions/status only, never a second top toolbar or independent recoloring of system truth
- A fixed Home control decided: a centered globe/home/square-outline icon, present on every page, returns to Desktop without closing apps, cannot be replaced by an active-page contribution
- Contextual settings decided: each page (Desktop, Scribble, etc.) supplies its own settings destination while global notifications stay Shell-owned
- Chat's consumption of the bar scoped: Chat may summarize desk/connection/notification state as Shell observations; its own API/MCP/model/Seed instruments stay in the Chat Lab, never becoming a second system-status authority
- Chat native desk protocol v2 published (source-tested) as the portable observation/contribution/window-boundary contract

**Not built yet:**
- The live adaptive Status Bar itself and its compositor transport — contract availability alone must not be advertised as a connected host
- The bounded status contract for standalone/non-Shell host frames
