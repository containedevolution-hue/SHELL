#!/usr/bin/env bash
# CE Hub Appliance — Hub Display setup (Wayland / labwc / Pi OS Desktop).
#
# The FREENOVE Pi 5 Hub Display runs Pi OS Desktop: lightdm auto-logs the user
# into a labwc (Wayland) session that already owns the screen. The kiosk is
# launched INTO that session from ~/.config/labwc/autostart — it does NOT start
# its own X server. (The earlier xinit approach fought labwc for display :0 and
# crash-looped; it's removed here, and any leftover unit is disabled below.)
#
# Run AFTER setup.sh and AFTER pairing (Settings → Hub → Paired ✓):
#   cd ~/ce-team/localhub/node-sidecar/pi && ./setup-display.sh && sudo reboot
#
# What it does:
#   1. Install Chromium + wlrctl
#   2. Fetch a display JWT from Railway using the stored pairing token
#   3. Save it to data/display-token.json
#   4. Install the kiosk launcher → /usr/local/bin/ce-hub-display-start
#   5. Hook it into the labwc session (~/.config/labwc/autostart), map the
#      touchscreen to the kiosk output, and disable the legacy xinit unit.
#
# On boot: lightdm autologin → labwc → autostart → launcher reads the token →
# /hub/ signs in with it → resumes the user's own PA thread → hands off to
# /chat.html: the Starling GLB + chat, fullscreen on the touchscreen, no login.
#
# Requirements: hub paired first (data/pairing.json has pairing_token) and the
# Pi has internet. Endpoints: routes/hub-display.js + routes/chat-sessions.js.

set -euo pipefail

if [[ $EUID -eq 0 ]]; then
  echo "Run as your normal user, not root."
  exit 1
fi

USER_NAME="$(whoami)"
USER_HOME="$HOME"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SIDECAR_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_DIR="$SIDECAR_DIR/data"
PAIRING_JSON="$DATA_DIR/pairing.json"
DISPLAY_TOKEN_JSON="$DATA_DIR/display-token.json"
RAILWAY_BASE="${RAILWAY_BASE:-https://app.containedevolution.com}"
LABWC_DIR="$USER_HOME/.config/labwc"
# The FREENOVE 4.3" touch panel is output DSI-2. Override if your kiosk screen
# is a different output (see `wlr-randr` for names).
KIOSK_OUTPUT="${KIOSK_OUTPUT:-DSI-2}"

# ── Pre-flight ────────────────────────────────────────────────────────────────
if [[ ! -f "$PAIRING_JSON" ]]; then
  echo "ERROR: $PAIRING_JSON not found. Pair the hub first (Settings → Hub)."
  exit 1
fi

PAIRING_TOKEN="$(python3 -c "import json,sys; print(json.load(open('$PAIRING_JSON'))['pairing_token'])" 2>/dev/null || true)"
if [[ -z "$PAIRING_TOKEN" ]]; then
  echo "ERROR: pairing_token not found in $PAIRING_JSON."
  exit 1
fi

echo "==> Pairing token found (${PAIRING_TOKEN:0:8}…)"
echo

# ── [1/5] Install Chromium + Wayland tooling ─────────────────────────────────
echo "==> [1/5] Install Chromium + wlrctl"
sudo apt-get update -y
sudo apt-get install -y chromium wlrctl

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

# ── [3/5] Kiosk launcher (Wayland) ────────────────────────────────────────────
echo "==> [3/5] Installing kiosk launcher"
sudo tee /usr/local/bin/ce-hub-display-start >/dev/null <<LAUNCH
#!/usr/bin/env bash
# CE Hub kiosk launcher (Wayland/labwc). Launched from ~/.config/labwc/autostart
# inside the auto-login session. Reads the display token at LAUNCH (so the
# recovery re-mint + reboot is enough), signs in at /hub/, and hands off to
# /chat.html — the Starling GLB + chat, fullscreen on the touchscreen.
set -euo pipefail
RAILWAY_BASE="$RAILWAY_BASE"
DISPLAY_TOKEN_JSON="$DISPLAY_TOKEN_JSON"

# Find this session's Wayland socket (skip the .lock files).
export XDG_RUNTIME_DIR="\${XDG_RUNTIME_DIR:-/run/user/\$(id -u)}"
for s in "\$XDG_RUNTIME_DIR"/wayland-*; do
  case "\$s" in *.lock) continue;; esac
  [ -S "\$s" ] && export WAYLAND_DISPLAY="\$(basename "\$s")" && break
done

# Silent sign-in: /hub/ trades this display token for a user JWT. Without a
# readable token the page says so on screen rather than failing blank.
DT="\$(python3 -c "import json;print(json.load(open('\$DISPLAY_TOKEN_JSON'))['display_token'])" 2>/dev/null || true)"
URL="\${RAILWAY_BASE}/hub/?dt=\${DT}"

exec chromium \\
  --ozone-platform=wayland \\
  --kiosk --start-fullscreen \\
  --noerrdialogs \\
  --disable-infobars \\
  --disable-session-crashed-bubble \\
  --disable-restore-session-state \\
  --disable-pinch \\
  --overscroll-history-navigation=0 \\
  --check-for-update-interval=31536000 \\
  --autoplay-policy=no-user-gesture-required \\
  --use-fake-ui-for-media-stream \\
  --app="\$URL"
LAUNCH
sudo chmod +x /usr/local/bin/ce-hub-display-start

# ── [4/5] Hook into the labwc session ─────────────────────────────────────────
echo "==> [4/5] Wiring the kiosk into the labwc autostart"
mkdir -p "$LABWC_DIR"

# autostart: launch the kiosk when the session comes up (idempotent).
AUTOSTART="$LABWC_DIR/autostart"
AUTOSTART_LINE="/usr/local/bin/ce-hub-display-start &"
touch "$AUTOSTART"
if ! grep -qF "$AUTOSTART_LINE" "$AUTOSTART"; then
  printf '%s\n' '# CE Hub kiosk — launched inside the labwc auto-login session.' \
    "$AUTOSTART_LINE" >> "$AUTOSTART"
fi

# Map the touch panel to the kiosk output so taps land on the Starling, not the
# secondary monitor. Best-effort: only touches an existing ILITEK <touch> line.
RC_XML="$LABWC_DIR/rc.xml"
if [[ -f "$RC_XML" ]]; then
  KIOSK_OUTPUT="$KIOSK_OUTPUT" RC_XML="$RC_XML" python3 - <<'PY' || true
import os, re
rc = os.environ["RC_XML"]; out = os.environ["KIOSK_OUTPUT"]
s = open(rc).read()
if "ILITEK" in s and 'mapToOutput' in s:
    s2 = re.sub(r'(ILITEK[^>]*mapToOutput=")[^"]*(")', r'\g<1>' + out + r'\g<2>', s)
    if s2 != s:
        open(rc, "w").write(s2); print("touch mapped to", out)
PY
fi

# Retire the legacy xinit unit if a prior setup left one behind.
if systemctl list-unit-files 2>/dev/null | grep -q '^cehub-display.service'; then
  echo "==> Disabling the legacy xinit cehub-display.service"
  sudo systemctl disable --now cehub-display.service 2>/dev/null || true
  sudo rm -f /etc/systemd/system/cehub-display.service
  sudo systemctl daemon-reload
fi

# ── [5/5] Verify ──────────────────────────────────────────────────────────────
echo "==> [5/5] Done."
echo
echo "Kiosk URL:"
echo "  ${RAILWAY_BASE}/hub/  (signs itself in with the display token — no login)"
echo
echo "Launch path:"
echo "  labwc autostart → /usr/local/bin/ce-hub-display-start (Chromium kiosk)"
echo
echo "==> sudo reboot to start the display."
echo "==> To refresh the display token: run this script again."
