#!/usr/bin/env bash
# Tenari Command Center — Pi audio bring-up (legacy Hub 7 root path).
#
# Single source of truth for Command Center audio. Six concerns,
# each addressed once at the system level so every audio path (Chromium
# kiosk browser TTS, the hub_speak MCP via Piper, future ElevenLabs)
# reaches the speakers without per-path config:
#
#   1. HDMI audio at the kernel/firmware level (config.txt overlays).
#      Pi 5 + cheap HDMI screens (52Pi EP-0184 included) often skip
#      announcing audio in their EDID, so the kernel never creates an
#      HDMI audio device. hdmi_drive=2 + hdmi_force_edid_audio=1 force
#      it. Applied to [all] so either Pi 5 HDMI port works.
#   2. alsa-utils + sox installed.
#   3. ALSA's `default` pinned to the probed HDMI hardware card via
#      /etc/asound.conf. Everything that opens `default` (Chromium,
#      speech-dispatcher, ad-hoc aplay) reaches HDMI without args.
#   4. /etc/cehub/audio.env stores the probed device. cehub.service
#      EnvironmentFile-loads it so lib/speaker.js passes `-D` to aplay,
#      bypassing the user-session ALSA defaults that systemd services
#      can't see.
#   5. speech-dispatcher + espeak-ng installed — Chromium's
#      window.speechSynthesis (browser TTS, kiosk Phase A6b voice surface)
#      requires this on Linux. Without it speechSynthesis is a no-op.
#   6. Piper + en_US-lessac-medium voice for the hub_speak MCP path.
#
# Run as the normal user (NOT root). Uses sudo internally. Idempotent —
# safe to re-run after a git pull. If config.txt changes, prompts for
# reboot and exits; re-run after reboot to finish probing + smoke tests.
#
#   cd ~/Tenari/localhub/node-sidecar/pi
#   ./setup-audio.sh

set -euo pipefail

if [[ $EUID -eq 0 ]]; then
  echo "Run this script as your normal user (not root). It uses sudo internally."
  exit 1
fi

USER_NAME="$(whoami)"
PIPER_DIR="/opt/piper"
PIPER_BIN="$PIPER_DIR/piper"
VOICES_DIR="$PIPER_DIR/voices"
VOICE_NAME="en_US-lessac-medium"
VOICE_ONNX="$VOICES_DIR/${VOICE_NAME}.onnx"
VOICE_JSON="$VOICES_DIR/${VOICE_NAME}.onnx.json"
VOICE_URL_BASE="https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium"
CONFIG_TXT="/boot/firmware/config.txt"
ASOUND_CONF="/etc/asound.conf"
AUDIO_ENV_DIR="/etc/cehub"
AUDIO_ENV="$AUDIO_ENV_DIR/audio.env"

ARCH=$(uname -m)
case "$ARCH" in
  aarch64|arm64) PIPER_ARCH="linux_aarch64" ;;
  x86_64|amd64)  PIPER_ARCH="linux_x86_64"  ;;
  armv7l)        PIPER_ARCH="linux_armv7l"  ;;
  *) echo "Unsupported arch: $ARCH"; exit 1 ;;
esac

# ── [1/6] HDMI audio at firmware level ────────────────────────────────────────
echo "==> [1/6] HDMI audio in $CONFIG_TXT"
if [[ ! -f "$CONFIG_TXT" ]]; then
  # Pi OS older layout fallback.
  CONFIG_TXT="/boot/config.txt"
  if [[ ! -f "$CONFIG_TXT" ]]; then
    echo "    ERROR: neither /boot/firmware/config.txt nor /boot/config.txt exists."
    exit 1
  fi
fi
CONFIG_CHANGED=0
if ! sudo grep -qxE '^[[:space:]]*hdmi_drive[[:space:]]*=[[:space:]]*2[[:space:]]*$' "$CONFIG_TXT"; then
  echo "hdmi_drive=2"           | sudo tee -a "$CONFIG_TXT" >/dev/null
  CONFIG_CHANGED=1
fi
if ! sudo grep -qxE '^[[:space:]]*hdmi_force_edid_audio[[:space:]]*=[[:space:]]*1[[:space:]]*$' "$CONFIG_TXT"; then
  echo "hdmi_force_edid_audio=1" | sudo tee -a "$CONFIG_TXT" >/dev/null
  CONFIG_CHANGED=1
fi
if [[ $CONFIG_CHANGED -eq 1 ]]; then
  echo "    config.txt changed — kernel reload required."
  echo "    Run:  sudo reboot"
  echo "    Then re-run this script to probe HDMI + finish."
  exit 0
fi
echo "    OK (hdmi_drive=2, hdmi_force_edid_audio=1)"

# ── [2/6] apt packages ────────────────────────────────────────────────────────
echo "==> [2/6] apt: alsa-utils sox speech-dispatcher espeak-ng"
sudo apt-get update -y
sudo apt-get install -y alsa-utils sox speech-dispatcher espeak-ng

if ! id -nG "$USER_NAME" | tr ' ' '\n' | grep -qx audio; then
  sudo usermod -aG audio "$USER_NAME"
  echo "    Added $USER_NAME to audio group (takes effect at next login;"
  echo "    systemd service picks it up at next service restart)."
fi

# ── [3/6] Probe ALSA for the HDMI playback card ───────────────────────────────
echo "==> [3/6] Probe ALSA playback hardware"
APLAY_OUTPUT="$(aplay -l 2>&1 || true)"
echo "$APLAY_OUTPUT" | sed 's/^/    /'

ALSA_DEVICE=""
CARD_NUM=""
# Prefer vc4-hdmi (Pi 5 HDMI audio). Match: "card N: vc4hdmi0 [vc4-hdmi-0], device M:"
HDMI_LINE="$(echo "$APLAY_OUTPUT" | grep -E 'card [0-9]+:.*vc4.*hdmi' | head -1 || true)"
if [[ -n "$HDMI_LINE" ]]; then
  CARD_NUM="$(echo "$HDMI_LINE" | sed -E 's/^card ([0-9]+):.*/\1/')"
  DEV_NUM="$(echo  "$HDMI_LINE" | sed -E 's/.*device ([0-9]+):.*/\1/')"
  ALSA_DEVICE="plughw:${CARD_NUM},${DEV_NUM}"
  echo "    HDMI card found → $ALSA_DEVICE"
elif echo "$APLAY_OUTPUT" | grep -qE '^card [0-9]+:'; then
  FIRST_LINE="$(echo "$APLAY_OUTPUT" | grep -E '^card [0-9]+:' | head -1)"
  CARD_NUM="$(echo "$FIRST_LINE" | sed -E 's/^card ([0-9]+):.*/\1/')"
  DEV_NUM="$(echo  "$FIRST_LINE" | sed -E 's/.*device ([0-9]+):.*/\1/')"
  [[ -z "$DEV_NUM" || "$DEV_NUM" = "$FIRST_LINE" ]] && DEV_NUM="0"
  ALSA_DEVICE="plughw:${CARD_NUM},${DEV_NUM}"
  echo "    No HDMI card visible — falling back to first card: $ALSA_DEVICE"
else
  echo "    ERROR: aplay sees no playback hardware at all."
  echo "    Verify $CONFIG_TXT has hdmi_drive=2 + hdmi_force_edid_audio=1,"
  echo "    then sudo reboot and re-run."
  exit 1
fi

# ── [4/6] /etc/asound.conf → default = the probed device ──────────────────────
echo "==> [4/6] $ASOUND_CONF (pin default → $ALSA_DEVICE)"
sudo tee "$ASOUND_CONF" >/dev/null <<EOF
# Generated by Tenari setup-audio.sh — do not edit by hand.
# Pins ALSA's "default" PCM to the HDMI hardware card the script probed.
pcm.!default {
  type plug
  slave.pcm "hw:${CARD_NUM},${DEV_NUM}"
}
ctl.!default {
  type hw
  card ${CARD_NUM}
}
EOF

# ── [5/6] /etc/cehub/audio.env → consumed by cehub.service ────────────────────
echo "==> [5/6] $AUDIO_ENV"
sudo mkdir -p "$AUDIO_ENV_DIR"
sudo tee "$AUDIO_ENV" >/dev/null <<EOF
# Generated by Tenari setup-audio.sh
ALSA_DEVICE=$ALSA_DEVICE
EOF

# ── [6/6] Piper binary + voice model ──────────────────────────────────────────
echo "==> [6/6] Piper ($PIPER_ARCH) + voice ($VOICE_NAME)"
sudo mkdir -p "$PIPER_DIR" "$VOICES_DIR"
sudo chown -R "$USER_NAME:$USER_NAME" "$PIPER_DIR"

if [[ ! -x "$PIPER_BIN" ]]; then
  TMP="$(mktemp -d)"
  ( cd "$TMP"
    curl -fsSL "https://github.com/rhasspy/piper/releases/latest/download/piper_${PIPER_ARCH}.tar.gz" -o piper.tar.gz
    tar -xzf piper.tar.gz
    cp -r piper/* "$PIPER_DIR/"
  )
  rm -rf "$TMP"
fi
"$PIPER_BIN" --version 2>&1 | head -1 || true

if [[ ! -f "$VOICE_ONNX" ]]; then
  curl -fsSL "$VOICE_URL_BASE/${VOICE_NAME}.onnx"      -o "$VOICE_ONNX"
fi
if [[ ! -f "$VOICE_JSON" ]]; then
  curl -fsSL "$VOICE_URL_BASE/${VOICE_NAME}.onnx.json" -o "$VOICE_JSON"
fi

# ── Smoke tests — fail loud ───────────────────────────────────────────────────
echo
echo "==> Smoke 1: 1.5s 440Hz tone → $ALSA_DEVICE"
TONE="/tmp/cehub-audio-test.wav"
if ! sox -n -r 22050 -c 2 "$TONE" synth 1.5 sine 440 2>/dev/null; then
  echo "    sox synth failed"; exit 1
fi
if ! aplay -D "$ALSA_DEVICE" "$TONE" 2>/dev/null; then
  echo "    aplay failed to play via $ALSA_DEVICE"
  rm -f "$TONE"; exit 1
fi
rm -f "$TONE"

echo
echo "==> Smoke 2: Piper TTS → $ALSA_DEVICE"
if ! echo "Hub audio is ready." \
  | "$PIPER_BIN" --model "$VOICE_ONNX" --output_raw 2>/dev/null \
  | aplay -D "$ALSA_DEVICE" -r 22050 -f S16_LE -t raw - 2>/dev/null; then
  echo "    Piper smoke failed"; exit 1
fi

echo
echo "==> All audio smoke tests passed."
echo "==> ALSA_DEVICE = $ALSA_DEVICE  (written to $AUDIO_ENV)"
echo
echo "==> Restart the sidecar so it picks up audio.env:"
echo "    sudo systemctl restart cehub.service"
echo
echo "==> Then ask your PA in chat: 'have the hub say hello'"
echo "==> And reload the kiosk page so Chromium re-detects speech-dispatcher"
echo "==> for browser TTS:"
echo "    sudo systemctl restart cehub-display.service"
