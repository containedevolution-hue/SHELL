#!/usr/bin/env bash
# Print the current cloudflared quick-tunnel URL for this appliance.
# Installed to /usr/local/bin/show-mcp-url by setup.sh.
# Usage: show-mcp-url

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
