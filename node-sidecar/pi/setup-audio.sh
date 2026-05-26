#!/usr/bin/env bash
# CE Hub Appliance — Pi audio + Piper TTS bring-up.
#
# Installs the Hub speaker-output dependencies referenced by the sidecar's
# lib/speaker.js: ALSA tooling for playback + the Piper neural TTS binary
# and an English voice model. Idempotent — safe to re-run after a `git
# pull` to update Piper or swap the voice model.
#
# Usage (on the Pi, as the normal user — not root):
#   cd ~/ce-team/localhub/node-sidecar/pi
#   ./setup-audio.sh
#
# After this completes, restart the sidecar:
#   sudo systemctl restart cehub.service
#
# Then verify from another LAN device (paired phone):
#   curl -X POST https://<hub-domain>:8443/mcp \
#        -H "Authorization: Bearer <pairing_token>" \
#        -H "content-type: application/json" \
#        -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
#             "params":{"name":"speak","arguments":{"text":"Hello from your Hub."}}}'
# The Pi's speakers should immediately say "Hello from your Hub."

set -euo pipefail

if [[ $EUID -eq 0 ]]; then
  echo "Run this script as your normal user (not root). It uses sudo internally."
  exit 1
fi

PIPER_DIR="/opt/piper"
PIPER_BIN="$PIPER_DIR/piper"
VOICES_DIR="$PIPER_DIR/voices"
VOICE_NAME="en_US-lessac-medium"
VOICE_ONNX="$VOICES_DIR/${VOICE_NAME}.onnx"
VOICE_JSON="$VOICES_DIR/${VOICE_NAME}.onnx.json"
VOICE_URL_BASE="https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium"

ARCH=$(uname -m)
case "$ARCH" in
  aarch64|arm64) PIPER_ARCH="linux_aarch64" ;;
  x86_64|amd64)  PIPER_ARCH="linux_x86_64"  ;;
  armv7l)        PIPER_ARCH="linux_armv7l"  ;;
  *) echo "Unsupported arch: $ARCH"; exit 1 ;;
esac

echo "==> [1/4] apt: alsa-utils + sox (playback + simple post-FX)"
sudo apt-get update -y
sudo apt-get install -y alsa-utils sox

echo "==> [2/4] /opt/piper layout (writable by current user for upgrades)"
sudo mkdir -p "$PIPER_DIR" "$VOICES_DIR"
sudo chown -R "$(whoami):$(whoami)" "$PIPER_DIR"

echo "==> [3/4] Piper binary ($PIPER_ARCH)"
if [[ ! -x "$PIPER_BIN" ]]; then
  TMP="$(mktemp -d)"
  cd "$TMP"
  # Piper releases use a flat tarball that extracts to ./piper/
  curl -fsSL "https://github.com/rhasspy/piper/releases/latest/download/piper_${PIPER_ARCH}.tar.gz" \
       -o piper.tar.gz
  tar -xzf piper.tar.gz
  cp -r piper/* "$PIPER_DIR/"
  cd - >/dev/null
  rm -rf "$TMP"
fi
"$PIPER_BIN" --version 2>&1 | head -1 || true

echo "==> [4/4] Voice model: $VOICE_NAME"
if [[ ! -f "$VOICE_ONNX" ]]; then
  curl -fsSL "$VOICE_URL_BASE/${VOICE_NAME}.onnx" -o "$VOICE_ONNX"
fi
if [[ ! -f "$VOICE_JSON" ]]; then
  curl -fsSL "$VOICE_URL_BASE/${VOICE_NAME}.onnx.json" -o "$VOICE_JSON"
fi

echo
echo "==> Smoke test: piping 'hub audio ready' to aplay…"
echo "hub audio ready" | "$PIPER_BIN" --model "$VOICE_ONNX" --output_raw 2>/dev/null \
  | aplay -r 22050 -f S16_LE -t raw - 2>/dev/null \
  && echo "==> Audio confirmed working." \
  || echo "==> Piper ran but aplay couldn't open the device — check your audio sink (raspi-config → Audio, or aplay -l)."

echo
echo "==> Restart the sidecar to pick up the new speak tool:"
echo "    sudo systemctl restart cehub.service"
echo
echo "==> Then ask your PA: \"have the hub say hello\""
