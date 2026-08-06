'use strict';

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
