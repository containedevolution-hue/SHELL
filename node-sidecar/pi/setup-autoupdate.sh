#!/usr/bin/env bash
# Tenari Command Center — auto-update setup.
#
# Installs a systemd timer that checks for new commits on origin/main every
# 5 minutes. Only pulls + restarts the sidecar when new code is available.
# No-op when nothing has changed — zero reconnects during idle periods.
#
#   ./setup-autoupdate.sh
#
# Requires: hub already set up (setup.sh run, cehub.service running).

set -euo pipefail

if [[ $EUID -eq 0 ]]; then
  echo "Run as your normal user, not root."
  exit 1
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
USER_NAME="$(whoami)"

echo "==> Repo: $REPO_DIR"
echo "==> User: $USER_NAME"

# ── Update script ─────────────────────────────────────────────────────────────
sudo tee /usr/local/bin/ce-hub-update >/dev/null <<SCRIPT
#!/usr/bin/env bash
set -euo pipefail
cd "$REPO_DIR"
git fetch origin main --quiet 2>/dev/null || exit 0
LOCAL=\$(git rev-parse HEAD)
REMOTE=\$(git rev-parse origin/main)
if [ "\$LOCAL" != "\$REMOTE" ]; then
  echo "[ce-hub-update] New commit detected — pulling and restarting"
  git pull --ff-only origin main
  sudo systemctl restart cehub.service
  echo "[ce-hub-update] Done"
fi
SCRIPT
sudo chmod +x /usr/local/bin/ce-hub-update

# ── systemd service ───────────────────────────────────────────────────────────
sudo tee /etc/systemd/system/cehub-update.service >/dev/null <<EOF
[Unit]
Description=Tenari Command Center — pull latest code from Railway deploy

[Service]
Type=oneshot
User=$USER_NAME
ExecStart=/usr/local/bin/ce-hub-update
EOF

# ── systemd timer (every 5 min) ───────────────────────────────────────────────
sudo tee /etc/systemd/system/cehub-update.timer >/dev/null <<EOF
[Unit]
Description=Tenari Command Center — check for updates every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
Unit=cehub-update.service

[Install]
WantedBy=timers.target
EOF

# ── passwordless restart (so the timer can apply updates unattended) ──────────
# The update script runs as $USER_NAME with no TTY, so its `systemctl restart`
# can't prompt for a password. Grant NOPASSWD for that one exact command only.
sudo tee /etc/sudoers.d/cehub-update >/dev/null <<SUDOERS
$USER_NAME ALL=(root) NOPASSWD: /usr/bin/systemctl restart cehub.service
SUDOERS
sudo chmod 0440 /etc/sudoers.d/cehub-update
sudo visudo -cf /etc/sudoers.d/cehub-update

sudo systemctl daemon-reload
sudo systemctl enable --now cehub-update.timer

echo
echo "==> Auto-update enabled."
echo "    Checks every 5 min. Pulls + restarts only when new code is available."
echo "    Timer status: sudo systemctl status cehub-update.timer"
