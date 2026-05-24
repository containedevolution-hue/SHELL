'use strict';

// Read the current cloudflared quick-tunnel URL.
// On the Pi: parses the cehub-tunnel.service journal (same source as show-mcp-url.sh).
// Override: set CEHUB_TUNNEL_URL env to skip journal parsing (useful in tests or
// non-systemd deploys where the URL is known ahead of time).

const { execSync } = require('child_process');

function getTunnelUrl() {
  if (process.env.CEHUB_TUNNEL_URL) return process.env.CEHUB_TUNNEL_URL;
  try {
    const out = execSync(
      'journalctl -u cehub-tunnel.service --no-pager -q 2>/dev/null',
      { encoding: 'utf8', timeout: 3000 }
    );
    const matches = out.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g);
    return matches ? matches[matches.length - 1] : null;
  } catch (_) {
    return null;
  }
}

module.exports = { getTunnelUrl };
