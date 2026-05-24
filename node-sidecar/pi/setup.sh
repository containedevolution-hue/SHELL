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

echo "==> [1/9] apt update + base packages"
sudo apt-get update -y
sudo apt-get install -y curl git ca-certificates avahi-daemon

echo "==> [2/9] Node 20 LTS (NodeSource)"
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -q '^v20\.'; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v

echo "==> [3/9] Hostname → cehub"
if [[ "$(hostnamectl --static)" != "cehub" ]]; then
  sudo hostnamectl set-hostname cehub
  # Update /etc/hosts so local resolution of `cehub` works without mDNS.
  sudo sed -i -E "s/^(127\.0\.1\.1[[:space:]]+).*/\1cehub/" /etc/hosts || true
fi

echo "==> [4/9] avahi-daemon (cehub.local mDNS)"
sudo systemctl enable --now avahi-daemon

echo "==> [5/9] npm install (sidecar deps, production only)"
cd "$SIDECAR_DIR"
npm install --omit=dev

echo "==> [6/9] systemd unit → /etc/systemd/system/cehub.service"
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

echo "==> [7/9] cloudflared ARM64 binary (A3 tunnel)"
if ! command -v cloudflared >/dev/null 2>&1; then
  ARCH=$(dpkg --print-architecture)
  curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}" \
       -o /tmp/cloudflared
  sudo install /tmp/cloudflared /usr/local/bin/cloudflared
  rm /tmp/cloudflared
fi
cloudflared --version

echo "==> [8/9] systemd unit → /etc/systemd/system/cehub-tunnel.service"
sudo tee /etc/systemd/system/cehub-tunnel.service >/dev/null <<EOF
[Unit]
Description=CE Hub Appliance — cloudflared quick tunnel (A3 MCP over HTTPS)
After=cehub.service
Requires=cehub.service

[Service]
Type=simple
User=$USER_NAME
ExecStart=/usr/local/bin/cloudflared tunnel --url http://127.0.0.1:5984 --no-autoupdate
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now cehub-tunnel.service

echo "==> [9/9] show-mcp-url helper → /usr/local/bin"
sudo install "$SCRIPT_DIR/show-mcp-url.sh" /usr/local/bin/show-mcp-url
# Allow the user to read journald logs without sudo (takes effect at next login).
sudo usermod -aG systemd-journal "$USER_NAME" 2>/dev/null || true

echo
echo "==> Waiting 5s for services to bind and tunnel to register…"
sleep 5
sudo systemctl status cehub.service --no-pager -l | head -8 || true
echo
sudo systemctl status cehub-tunnel.service --no-pager -l | head -8 || true

echo
echo "==> Verify locally (A1 + A2):"
echo "    curl http://localhost:5984/"
echo "    curl -X POST http://localhost:5984/mcp -H 'content-type: application/json' \\"
echo "         -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}'"
echo
echo "==> Get tunnel URL (A3) — after ~10s for cloudflared to connect:"
echo "    show-mcp-url"
echo
echo "==> From another LAN device (after reboot):"
echo "    curl http://cehub.local:5984/"
echo
echo "==> sudo reboot recommended to confirm both units come up clean."
