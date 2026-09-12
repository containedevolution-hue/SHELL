# Status Bar

CEE OS's persistent system-status surface. It does not host directories, page menus, active-window controls, search, settings, or application actions.

**Built:**
- CEE OS owns the bar, its alerts, and its system truth; applications cannot contribute controls or render a second top toolbar
- A fixed Home control decided: a centered globe/home/square-outline icon, present on every page, returns to Desktop without closing apps, cannot be replaced by an active-page contribution
- Notifications is the only other visible control and remains available across every surface
- Page navigation and settings render inside their owning surface as solid dimensional spheres
- Chat's consumption of the bar scoped: Chat may summarize desk/connection/notification state as Shell observations; its own API/MCP/model/Seed instruments stay in the Chat Lab, never becoming a second system-status authority
- Chat native desk protocol v2 published (source-tested) as the portable observation/contribution/window-boundary contract

**Not built yet:**
- Live notification transport and system-alert evidence
- The bounded status contract for standalone/non-Shell host frames
