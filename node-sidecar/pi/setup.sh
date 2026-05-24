#!/usr/bin/env bash
# CE Hub Appliance — Pi bring-up script.
#
# Run on a fresh Pi OS Lite install AFTER you've cloned the ce-team repo:
#   git clone <repo-url> ~/ce-team
#   cd ~/ce-team/localhub/node-sidecar/pi
#   ./setup.sh
#   sudo reboot
#
# Idempotent — safe to re-run after a `git pull` to pick up sidecar updates.
# Verifies live state after install with the same curls A1/A2 documents.

set -euo pipefail

if [[ $EUID -eq 0 ]]; then
  echo "Run this script as your normal user (not root). It uses sudo internally."
  exit 1
fi

USER_NAME="$(whoami)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SIDECAR_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="$(cd "$SIDECAR_DIR/../.." && pwd)"

echo "==> User:        $USER_NAME"
echo "==> Repo:        $REPO_DIR"
echo "==> Sidecar:     $SIDECAR_DIR"
echo

echo "==> [1/7] apt update + base packages"
sudo apt-get update -y
sudo apt-get install -y curl git ca-certificates avahi-daemon

echo "==> [2/7] Node 20 LTS (NodeSource)"
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -q '^v20\.'; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v

echo "==> [3/7] Hostname → cehub"
if [[ "$(hostnamectl --static)" != "cehub" ]]; then
  sudo hostnamectl set-hostname cehub
  # Update /etc/hosts so local resolution of `cehub` works without mDNS.
  sudo sed -i -E "s/^(127\.0\.1\.1[[:space:]]+).*/\1cehub/" /etc/hosts || true
fi

echo "==> [4/7] avahi-daemon (cehub.local mDNS)"
sudo systemctl enable --now avahi-daemon

echo "==> [5/7] npm install (sidecar deps, production only)"
cd "$SIDECAR_DIR"
npm install --omit=dev

echo "==> [6/7] systemd unit → /etc/systemd/system/cehub.service"
sudo tee /etc/systemd/system/cehub.service >/dev/null <<EOF
[Unit]
Description=CE Hub Appliance — LocalHub Node sidecar (PouchDB + MCP)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$SIDECAR_DIR
ExecStart=/usr/bin/node index.js
Environment=LOCALHUB_HOST=0.0.0.0
Environment=NODE_ENV=production
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now cehub.service

echo "==> [7/7] Waiting 3s for service to bind…"
sleep 3
sudo systemctl status cehub.service --no-pager -l | head -12 || true

echo
echo "==> Verify locally:"
echo "    curl http://localhost:5984/"
echo "    curl -X POST http://localhost:5984/mcp -H 'content-type: application/json' \\"
echo "         -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}'"
echo
echo "==> From another LAN device (after reboot):"
echo "    curl http://cehub.local:5984/"
echo
echo "==> sudo reboot recommended to confirm the unit comes up clean."
