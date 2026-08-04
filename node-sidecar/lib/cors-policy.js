'use strict';

const cors = require('cors');

const LOOPBACK_ORIGIN_RE = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;
// tenari.world is the app origin. The containedevolution app origin was hard-cut
// 2026-08-04 and www.containedevolution.com dropped as vestigial (never a real
// caller). CE stays the company/infra domain, not an origin that calls the sidecar.
const FIXED_ORIGINS = new Set([
  'https://app.tenari.world',
  'https://tenari.world',
  'https://www.tenari.world',
  'https://dev.tenari.world',
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
]);

function isAllowedOrigin(origin) {
  return !origin || FIXED_ORIGINS.has(origin) || LOOPBACK_ORIGIN_RE.test(origin);
}

function privateNetworkPreflight(req, res, next) {
  if (req.method === 'OPTIONS' && req.headers['access-control-request-private-network']) {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
  next();
}

function createCorsMiddleware() {
  return cors({
    origin(origin, cb) { cb(null, isAllowedOrigin(origin)); },
    credentials: false,
  });
}

module.exports = {
  FIXED_ORIGINS,
  isAllowedOrigin,
  privateNetworkPreflight,
  createCorsMiddleware,
};
