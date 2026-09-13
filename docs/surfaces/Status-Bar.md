# Status Bar

CEE OS's persistent system-status surface. It does not host directories, page menus, search, settings, or arbitrary application-contributed actions.

**Built:**
- CEE OS owns the bar, its alerts, and its system truth; applications cannot contribute controls or render a second top toolbar
- The fixed center control is the blue ember labeled Core. It opens Core from every page and cannot be replaced by an active-page contribution.
- Notifications remains available across every surface. CEE OS also owns an Active Apps lifecycle control and conditionally shows a manual Checkpoint control while a checkpoint-capable Powerhouse or container is active; applications cannot insert their own controls.
- Page navigation and settings render inside their owning surface as solid dimensional spheres
- Chat's consumption of the bar scoped: Chat may summarize desk/connection/notification state as Shell observations; its own API/MCP/model/Seed instruments stay in the Chat Lab, never becoming a second system-status authority
- Chat native desk protocol v2 published (source-tested) as the portable observation/contribution/window-boundary contract

**Not built yet:**
- Live notification transport and system-alert evidence
- The bounded status contract for standalone/non-Shell host frames
