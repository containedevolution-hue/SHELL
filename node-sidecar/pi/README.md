# SHELL — Pi Bring-Up

Plug-and-play setup for the Tier 0 Raspberry Pi 5 SHELL appliance, scoped to run SEED only (no desktop, Companion, or cloud path).

Clone the standalone source from `https://github.com/containedevolution-hue/SHELL.git` before running `setup.sh`.

**Built:**
- A setup script (`setup.sh`) implemented and idempotent: installs prerequisites, Node 20 LTS, sets the hostname, enables avahi for `.local` resolution, installs sidecar dependencies, and registers/starts the `cehub` systemd service
- An MCP tunnel implemented: a `cloudflared` quick tunnel plus a `show-mcp-url` helper exposes the Pi's MCP endpoint outside the LAN, verified end-to-end with a live `tools/list` and `get_system_status` call over the tunnel
- A local verification path documented: a public `/pair` status check, plus a credential-gated `/mcp` tools/list and live tool call

**Not built yet:**
- HTTPS/cert for the phone PWA (needs QR pairing plus cert trust)
- Cloud PA tool registration (a settings UI plus an adapter that calls the tunnel URL)
- A stable (non-ephemeral) tunnel URL — a planned persistent WebSocket tunnel replacing the quick-tunnel workaround
- Voice, camera, and any physical capability
