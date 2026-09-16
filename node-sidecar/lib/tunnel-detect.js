'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execSync } = require('node:child_process');

function normalizePublicTunnelUrl(value) {
  const candidate = String(value || '').trim();
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate.includes('://') ? candidate : `https://${candidate}`);
    if (parsed.protocol !== 'https:' || !parsed.hostname.includes('.')) return null;
    return parsed.origin;
  } catch (_) {
    return null;
  }
}

function namedTunnelUrl(configPath = path.join(os.homedir(), '.cloudflared', 'config.yml')) {
  try {
    const config = fs.readFileSync(configPath, 'utf8');
    const hostname = config.match(/^\s*-\s*hostname:\s*["']?([^\s"'#]+)["']?/m)?.[1];
    return normalizePublicTunnelUrl(hostname);
  } catch (_) {
    return null;
  }
}

function getTunnelUrl() {
  const configured = normalizePublicTunnelUrl(process.env.CEHUB_TUNNEL_URL);
  if (configured) return configured;
  const named = namedTunnelUrl(process.env.CEHUB_CLOUDFLARED_CONFIG);
  if (named) return named;
  try {
    const out = execSync(
      'journalctl -u cehub-tunnel.service --no-pager -q 2>/dev/null',
      { encoding: 'utf8', timeout: 3000 }
    );
    const matches = out.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g);
    return matches ? normalizePublicTunnelUrl(matches[matches.length - 1]) : null;
  } catch (_) {
    return null;
  }
}

module.exports = { getTunnelUrl, normalizePublicTunnelUrl, namedTunnelUrl };
