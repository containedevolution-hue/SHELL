#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -eq 0 ]]; then
  echo "Run as your normal user, not root."
  exit 1
fi

USER_HOME="$HOME"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SIDECAR_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_DIR="$SIDECAR_DIR/data"
PAIRING_JSON="$DATA_DIR/pairing.json"
DISPLAY_TOKEN_JSON="$DATA_DIR/display-token.json"
RAILWAY_BASE="${RAILWAY_BASE:-https://app.tenari.world}"
LABWC_DIR="$USER_HOME/.config/labwc"
KIOSK_OUTPUT="${KIOSK_OUTPUT:-DSI-1}"

if [[ ! -f "$PAIRING_JSON" ]]; then
  echo "ERROR: $PAIRING_JSON not found. Pair the Command Center first."
  exit 1
fi

PAIRING_TOKEN="$(python3 -c "import json; print(json.load(open('$PAIRING_JSON'))['pairing_token'])" 2>/dev/null || true)"
if [[ -z "$PAIRING_TOKEN" ]]; then
  echo "ERROR: pairing_token not found in $PAIRING_JSON."
  exit 1
fi

echo "==> [1/5] Install Chromium and Wayland tooling"
sudo apt-get update -y
sudo apt-get install -y chromium wlrctl

echo "==> [2/5] Fetch display session"
RESPONSE="$(curl -sf -X POST "$RAILWAY_BASE/api/hub/display-token" -H "Authorization: Bearer $PAIRING_TOKEN" -H "Content-Type: application/json")"
DISPLAY_TOKEN="$(printf '%s' "$RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['display_token'])")"
if [[ -z "$DISPLAY_TOKEN" ]]; then
  echo "ERROR: display token missing. Re-pair the Command Center and retry."
  exit 1
fi
mkdir -p "$DATA_DIR"
printf '{"display_token":"%s"}\n' "$DISPLAY_TOKEN" > "$DISPLAY_TOKEN_JSON"
chmod 600 "$DISPLAY_TOKEN_JSON"

echo "==> [3/5] Install Command Center launcher"
sudo tee /usr/local/bin/ce-hub-display-start >/dev/null <<LAUNCH
#!/usr/bin/env bash
set -euo pipefail
RAILWAY_BASE="$RAILWAY_BASE"
DISPLAY_TOKEN_JSON="$DISPLAY_TOKEN_JSON"
export XDG_RUNTIME_DIR="\${XDG_RUNTIME_DIR:-/run/user/\$(id -u)}"
for socket in "\$XDG_RUNTIME_DIR"/wayland-*; do
  case "\$socket" in *.lock) continue;; esac
  if [[ -S "\$socket" ]]; then
    export WAYLAND_DISPLAY="\$(basename "\$socket")"
    break
  fi
done
DT="\$(python3 -c "import json; print(json.load(open('\$DISPLAY_TOKEN_JSON'))['display_token'])" 2>/dev/null || true)"
URL="\${RAILWAY_BASE}/localhub/?dt=\${DT}"
exec chromium \
  --ozone-platform=wayland \
  --kiosk \
  --start-fullscreen \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-restore-session-state \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --check-for-update-interval=31536000 \
  --autoplay-policy=no-user-gesture-required \
  --use-fake-ui-for-media-stream \
  --app="\$URL"
LAUNCH
sudo chmod +x /usr/local/bin/ce-hub-display-start

echo "==> [4/5] Wire the desktop session"
mkdir -p "$LABWC_DIR"
AUTOSTART="$LABWC_DIR/autostart"
AUTOSTART_LINE="/usr/local/bin/ce-hub-display-start &"
touch "$AUTOSTART"
if ! grep -qF "$AUTOSTART_LINE" "$AUTOSTART"; then
  printf '%s\n' "$AUTOSTART_LINE" >> "$AUTOSTART"
fi

RC_XML="$LABWC_DIR/rc.xml"
if [[ -f "$RC_XML" ]]; then
  KIOSK_OUTPUT="$KIOSK_OUTPUT" RC_XML="$RC_XML" python3 - <<'PY' || true
import os, re
path = os.environ['RC_XML']
output = os.environ['KIOSK_OUTPUT']
source = open(path).read()
updated = re.sub(r'(ILITEK[^>]*mapToOutput=")[^"]*(")', r'\g<1>' + output + r'\g<2>', source)
if updated != source:
    open(path, 'w').write(updated)
PY
fi

if systemctl list-unit-files 2>/dev/null | grep -q '^cehub-display.service'; then
  sudo systemctl disable --now cehub-display.service 2>/dev/null || true
  sudo rm -f /etc/systemd/system/cehub-display.service
  sudo systemctl daemon-reload
fi

echo "==> [5/5] Command Center display ready"
echo "URL: ${RAILWAY_BASE}/localhub/"
echo "Run sudo reboot to validate startup."
