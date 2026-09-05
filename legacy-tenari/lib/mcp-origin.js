'use strict';

function originAllowed(origin) {
  if (!origin) return true;
  let host;
  try { host = new URL(origin).hostname; } catch (_) { return false; }
  return host === 'localhost'
    || host === '127.0.0.1'
    || host === '::1'
    || host === '[::1]'
    || host.endsWith('.localhost');
}

function requireLocalOrigin(req, res, next) {
  if (originAllowed(req.headers.origin)) return next();
  return res.status(403).json({
    jsonrpc: '2.0',
    id: null,
    error: { code: -32000, message: 'Origin not allowed' },
  });
}

module.exports = { originAllowed, requireLocalOrigin };
