#!/usr/bin/env bash
# CE Hub Appliance — Hub Display setup (A6a).
#
# Run AFTER setup.sh and AFTER the hub is paired (Settings → Integrations →
# Hub paired ✓). This script installs Chromium + a minimal display stack and
# sets up a systemd unit that launches the ambient kiosk on boot.
#
#   cd ~/ce-team/localhub/node-sidecar/pi
#   ./setup-display.sh
#   sudo reboot
#
# What it does:
#   1. Install Chromium + minimal X11 (xorg, x11-xserver-utils)
#   2. Fetch a display JWT from Railway using the stored pairing token
#   3. Save token to data/display-token.json
#   4. Install the kiosk launch script → /usr/local/bin/ce-hub-display-start
#   5. Install + enable cehub-display.service (starts Chromium kiosk on boot)
#
# Requirements: hub must be paired first (data/pairing.json must contain
# pairing_token) and the Pi must have internet access.

set -euo pipefail

if [[ $EUID -eq 0 ]]; then
  echo "Run as your normal user, not root."
  exit 1
fi

USER_NAME="$(whoami)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SIDECAR_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_DIR="$SIDECAR_DIR/data"
PAIRING_JSON="$DATA_DIR/pairing.json"
DISPLAY_TOKEN_JSON="$DATA_DIR/display-token.json"
RAILWAY_BASE="${RAILWAY_BASE:-https://app.containedevolution.com}"

# ── Pre-flight ────────────────────────────────────────────────────────────────
if [[ ! -f "$PAIRING_JSON" ]]; then
  echo "ERROR: $PAIRING_JSON not found. Pair the hub first (Settings → Integrations)."
  exit 1
fi

PAIRING_TOKEN="$(python3 -c "import json,sys; print(json.load(open('$PAIRING_JSON'))['pairing_token'])" 2>/dev/null || true)"
if [[ -z "$PAIRING_TOKEN" ]]; then
  echo "ERROR: pairing_token not found in $PAIRING_JSON."
  exit 1
fi

echo "==> Pairing token found (${PAIRING_TOKEN:0:8}…)"
echo

# ── [1/5] Install Chromium + minimal X11 ─────────────────────────────────────
echo "==> [1/5] Install Chromium + x11"
sudo apt-get update -y
sudo apt-get install -y chromium-browser xorg x11-xserver-utils unclutter

# ── [2/5] Fetch display JWT from Railway ──────────────────────────────────────
echo "==> [2/5] Fetching display JWT from Railway…"
RESPONSE=$(curl -sf -X POST "$RAILWAY_BASE/api/hub/display-token" \
  -H "Authorization: Bearer $PAIRING_TOKEN" \
  -H "Content-Type: application/json")

if [[ -z "$RESPONSE" ]]; then
  echo "ERROR: No response from Railway. Check the hub is paired and Railway is reachable."
  exit 1
fi

DISPLAY_TOKEN="$(echo "$RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['display_token'])")"
if [[ -z "$DISPLAY_TOKEN" ]]; then
  echo "ERROR: display_token missing from response: $RESPONSE"
  exit 1
fi

mkdir -p "$DATA_DIR"
echo "{\"display_token\":\"$DISPLAY_TOKEN\"}" > "$DISPLAY_TOKEN_JSON"
echo "==> Display token saved to $DISPLAY_TOKEN_JSON"

# ── [3/5] Kiosk launch script ─────────────────────────────────────────────────
echo "==> [3/5] Installing kiosk launch script"
sudo tee /usr/local/bin/ce-hub-display-start >/dev/null <<LAUNCH
#!/usr/bin/env bash
# Launched by cehub-display.service via xinit. Reads the display token,
# disables screen blanking, and starts Chromium in kiosk mode.
set -euo pipefail

TOKEN_FILE="$DISPLAY_TOKEN_JSON"
RAILWAY_BASE="$RAILWAY_BASE"

TOKEN="\$(python3 -c "import json; print(json.load(open('\$TOKEN_FILE'))['display_token'])" 2>/dev/null || true)"

if [[ -z "\$TOKEN" ]]; then
  echo "[hub-display] No display token — run setup-display.sh again after pairing."
  sleep 30
  exit 1
fi

# Disable DPMS + screen blanking for always-on ambient display.
xset -dpms
xset s off
xset s noblank

# Hide the mouse cursor after 1s idle.
unclutter -idle 1 -root &

URL="\${RAILWAY_BASE}/hub-display/?dt=\${TOKEN}"

exec chromium-browser \\
  --kiosk \\
  --noerrdialogs \\
  --disable-infobars \\
  --disable-session-crashed-bubble \\
  --disable-restore-session-state \\
  --disable-pinch \\
  --overscroll-history-navigation=0 \\
  --check-for-update-interval=31536000 \\
  --app="\$URL"
LAUNCH
sudo chmod +x /usr/local/bin/ce-hub-display-start

# ── [4/5] systemd unit ────────────────────────────────────────────────────────
echo "==> [4/5] Installing cehub-display.service"
sudo tee /etc/systemd/system/cehub-display.service >/dev/null <<EOF
[Unit]
Description=CE Hub Display — Chromium kiosk (ambient orb + bulletins)
After=network-online.target cehub.service graphical.target
Wants=network-online.target

[Service]
Type=simple
User=$USER_NAME
Environment=DISPLAY=:0
Environment=HOME=/home/$USER_NAME
ExecStartPre=/bin/sleep 8
ExecStart=/usr/bin/xinit /usr/local/bin/ce-hub-display-start -- :0 -nocursor
Restart=always
RestartSec=10

[Install]
WantedBy=graphical.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable cehub-display.service

# ── [5/5] Verify ──────────────────────────────────────────────────────────────
echo "==> [5/5] Done."
echo
echo "Kiosk URL (contains your display token — keep private):"
echo "  ${RAILWAY_BASE}/hub-display/?dt=${DISPLAY_TOKEN:0:16}…"
echo
echo "Services enabled:"
echo "  cehub-display.service  (Chromium kiosk — starts on reboot)"
echo
echo "==> sudo reboot to start the display."
echo "==> To refresh the display token: run this script again."
