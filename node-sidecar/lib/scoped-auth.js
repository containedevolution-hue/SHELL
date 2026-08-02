'use strict';

function isLoopbackRequest(req) {
  const ip = req?.socket?.remoteAddress || '';
  const socketIsLoopback = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  if (!socketIsLoopback) return false;

  // cloudflared reaches the origin over a loopback socket too. Never inherit
  // local trust through a reverse proxy: Cloudflare/forwarding headers OR a
  // non-loopback Host make this a remote request even when remoteAddress is
  // 127.0.0.1. Direct desktop/kiosk calls use localhost/127.0.0.1 as Host.
  const headers = req.headers || {};
  if (headers['cf-connecting-ip'] || headers['cf-ray'] || headers['x-forwarded-for']
      || headers.forwarded || headers['x-real-ip']) return false;
  const host = String(headers.host || '').toLowerCase();
  return /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
}

function createScopedTokenGuard(pairing, scope) {
  if (!pairing || typeof pairing.matchesToken !== 'function') {
    throw new TypeError('pairing.matchesToken required');
  }
  if (scope !== 'sync' && scope !== 'mcp') throw new TypeError('scope must be sync|mcp');
  return function scopedToken(req, res, next) {
    // Same-machine desktop/kiosk traffic never crosses the LAN or tunnel and
    // remains available before pairing. Every non-loopback request is gated,
    // including an unpaired Hub exposed by a Cloudflare tunnel.
    if (isLoopbackRequest(req)) return next();
    const auth = req.headers.authorization || '';
    const candidate = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (pairing.matchesToken(scope, candidate)) return next();
    return res.status(401).json({ error: 'invalid_token' });
  };
}

function createPairedDatabaseGuard(pairing) {
  if (!pairing || typeof pairing.getUserId !== 'function') {
    throw new TypeError('pairing.getUserId required');
  }
  return function pairedDatabase(req, res, next) {
    if (isLoopbackRequest(req)) return next();
    const userId = pairing.getUserId();
    if (!userId) return res.status(403).json({ error: 'hub_not_paired' });
    let first = '';
    try { first = decodeURIComponent(String(req.path || '').split('/').filter(Boolean)[0] || ''); }
    catch (_) { return res.status(400).json({ error: 'invalid_database_path' }); }
    if (first !== `ce-memories-${String(userId)}`) {
      return res.status(403).json({ error: 'database_not_authorized' });
    }
    return next();
  };
}

module.exports = { isLoopbackRequest, createScopedTokenGuard, createPairedDatabaseGuard };
