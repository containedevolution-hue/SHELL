# SHELL — Pi bring-up

Plug-and-play setup for the Tier 0 Pi 5 SHELL appliance. Takes ~5 min from sealed
box to live appliance (excluding the OS flash itself).

## 1 — Flash Pi OS (64-bit)

Use **Raspberry Pi Imager** on your laptop. Two OS variants are both valid:

- **Raspberry Pi OS Lite (64-bit)** — no desktop environment. ~550 MB. The
  default for a shelf-sitting headless appliance. Phone PWA is the only UI.
- **Raspberry Pi OS Full (64-bit)** — full desktop + Chromium pre-installed.
  ~1.9 GB. Pick this if you want to attach an HDMI screen and use the deployed
  PWA from the Pi itself (see [`../../README.md`](../../README.md)).
  Slower boot, ~1 GB more RAM in
  use — still fine on Pi 5 4GB. Same `setup.sh` works on both.

Click the gear icon (or NEXT → EDIT SETTINGS in Imager 2.x) and set:

- **Hostname:** `cehub`
- **SSH:** enabled (use public-key auth if you have a key; otherwise password)
- **Wi-Fi:** your network (or skip if using Ethernet)
- **Locale / timezone:** your zone
- **Username:** whatever you want (script picks it up from `whoami`)

Image to the SD card. Insert into Pi. Plug in power + Ethernet (Ethernet
recommended on Tier 0 — Wi-Fi works but mDNS is flakier on some routers).

## 2 — SSH in

From your laptop on the same LAN:

```
ssh <user>@cehub.local
```

If `cehub.local` doesn't resolve, find the Pi's IP from your router and use
that instead — the setup script makes `cehub.local` work for next time.

## 3 — Auth GitHub on the Pi

The repo is private, so a fresh Pi can't clone until it has credentials.
Fastest path is the GitHub CLI device flow:

```
sudo apt update && sudo apt install -y gh
gh auth login
```

When prompted: **GitHub.com → HTTPS → "Login with a web browser"**. It prints
an 8-character code. On your laptop open `https://github.com/login/device`,
paste the code, approve. The Pi terminal continues automatically.

(Alternative: SSH key on the Pi added to your GitHub account. `gh` is faster
because no key juggling.)

## 4 — Clone + run setup

```
gh repo clone containedevolution-hue/SHELL ~/SHELL
cd ~/SHELL/node-sidecar/pi
./setup.sh
```

The script is idempotent. Re-run it after a `git pull` to pick up sidecar
updates.

What it does:

1. apt update + install curl/git/avahi
2. Install Node 20 LTS via NodeSource
3. Set hostname to `cehub` (already set by Imager, this re-asserts it)
4. Enable avahi-daemon so `cehub.local` works on the LAN
5. `npm install --omit=dev` in the sidecar
6. Drop `/etc/systemd/system/cehub.service` with `LOCALHUB_HOST=0.0.0.0`
7. Enable + start the service

## 5 — Verify

```
sudo reboot
```

Wait ~30s, then from your laptop:

```
# A1 — PouchDB welcome
curl http://cehub.local:5984/

# A2 — MCP tools list
curl -X POST http://cehub.local:5984/mcp \
     -H 'content-type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# A2 — A live tool call
curl -X POST http://cehub.local:5984/mcp \
     -H 'content-type: application/json' \
     -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_system_status","arguments":{}}}'
```

Both A1 and A2 should respond. The system-status call is the end-to-end
round-trip that proves the appliance is reachable + the MCP host is alive.

## 6 — Get your MCP tunnel URL (A3)

`setup.sh` installs `cloudflared` and a second systemd unit (`cehub-tunnel.service`)
that opens an HTTPS tunnel to the outside world so the cloud PA can reach the
appliance's MCP endpoint from anywhere. This uses a **cloudflared quick tunnel**
(no Cloudflare account needed; hosted at `trycloudflare.com`).

After reboot, on the Pi:

```
show-mcp-url
```

It prints something like:

```
https://randomly-assigned-name.trycloudflare.com
```

That URL is your MCP endpoint. The cloud PA will call `<url>/mcp` (not the
PouchDB root) — so the full endpoint path you'll paste into Settings is the
URL as-is, no trailing path needed (the PA appends `/mcp` itself in A4).

> **Note:** Quick tunnel URLs are ephemeral — they change each time
> `cehub-tunnel.service` restarts. After a Pi reboot, run `show-mcp-url`
> again and update Settings if the URL changed. This limitation goes away
> when C6 (the persistent WebSocket tunnel) replaces cloudflared.

If `show-mcp-url` returns nothing, cloudflared is still connecting — wait 10s
and retry. To watch it live:

```
journalctl -u cehub-tunnel.service -f
```

You should see the tunnel URL appear within a few seconds of the line
`Connection registered`.

### A3 verify from your laptop

Once you have the URL, confirm it reaches the MCP host from outside the LAN:

```bash
TUNNEL=https://your-name.trycloudflare.com

# tools/list — should return the three read-only tools
curl -s -X POST "$TUNNEL/mcp" \
     -H 'content-type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq .

# live tool call — should return system status from the Pi
curl -s -X POST "$TUNNEL/mcp" \
     -H 'content-type: application/json' \
     -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_system_status","arguments":{}}}' | jq .
```

## Troubleshooting

- **`cehub.local` doesn't resolve** — use the Pi's IP instead. Some routers
  block mDNS broadcast. On macOS/Linux clients `.local` works out of the box;
  on Windows it works with Bonjour (installed with iTunes) or with the
  modern Windows 11 mDNS responder.
- **Service won't start** — `sudo journalctl -u cehub.service -e` shows the
  last error. Usually a Node version mismatch or a path the unit can't see.
- **Port 5984 already in use** — another CouchDB-style server is running.
  `sudo lsof -i :5984` to find it.

## What's intentionally NOT here yet

- HTTPS / cert (mixed-content blocks the phone PWA → A5 brings QR pairing
  + cert trust)
- Cloud PA tool registration (A4 — settings UI + cloud PA adapter that calls
  the tunnel URL)
- Stable tunnel URL — quick tunnel URL changes on restart; C6 WebSocket tunnel
  fixes this after C3b/A5 pairing auth exists
- Voice, camera, anything physical (Phase B+)

Phase A is connectivity parity. The Pi answers from outside the LAN (A3);
A4 wires the cloud PA to use it; everything else ladders up from there.
