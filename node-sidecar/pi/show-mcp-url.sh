#!/usr/bin/env bash
# Print the current cloudflared tunnel URL for this appliance.
# Installed to /usr/local/bin/show-mcp-url by setup.sh.
# Usage: show-mcp-url
#
# Prefers the stable named-tunnel URL from /etc/cehub/tunnel.env (Cyclone 6.1)
# over the journalctl-derived quick-tunnel URL, since the journal can contain
# stale URLs from previous cloudflared lifetimes.

# 1. Cyclone 6.1 — named tunnel via setup-cyclone6-tunnel.sh
if [ -f /etc/cehub/tunnel.env ]; then
  CEHUB_TUNNEL_URL=$(grep -E '^CEHUB_TUNNEL_URL=' /etc/cehub/tunnel.env | tail -1 | cut -d= -f2-)
  if [ -n "$CEHUB_TUNNEL_URL" ]; then
    echo "$CEHUB_TUNNEL_URL"
    exit 0
  fi
fi

# 2. Quick tunnel fallback — most recent URL in journal.
URL=$(journalctl -u cehub-tunnel.service --no-pager -q 2>/dev/null \
      | grep -oP 'https://[a-z0-9-]+\.trycloudflare\.com' \
      | tail -1)

if [ -z "$URL" ]; then
  echo "No tunnel URL yet — cloudflared may still be connecting."
  echo "Wait ~10s then retry, or watch live:"
  echo "  journalctl -u cehub-tunnel.service -f"
else
  echo "$URL"
fi
