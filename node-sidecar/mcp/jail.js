'use strict';

// Path jail for the filesystem tools — DEFAULT-DENY.
//
// The assistant may only read inside folders the user has explicitly shared.
// Allowed roots come from, in order:
//   1. MCP_ROOT env — an explicit single-root override (back-compat / power use).
//   2. The user's folder allowlist (mcp/allowlist.js → <dataDir>/mcp-allowlist.json)
//      — what the desktop's folder picker writes.
//   3. Appliance (Pi) back-compat: if nothing above is set AND the sidecar runs in
//      appliance mode (LOCALHUB_HOST=0.0.0.0), the box's own home dir — so the Pi
//      is unchanged. A desktop (loopback) with an empty allowlist shares NOTHING.
//
// Symlinks are NOT resolved for the containment check (path.resolve, not
// fs.realpath) so a planted symlink can't point the assistant outside a root.

const path = require('path');
const os = require('os');
const allowlist = require('./allowlist');

// Resolved fresh each call so a folder the user just shared takes effect without
// a sidecar restart.
function allowedRoots() {
  const roots = [];
  if (process.env.MCP_ROOT) roots.push(path.resolve(process.env.MCP_ROOT));
  for (const f of allowlist.list()) roots.push(path.resolve(f));
  if (roots.length === 0 && process.env.LOCALHUB_HOST === '0.0.0.0') {
    roots.push(path.resolve(os.homedir())); // Pi appliance back-compat
  }
  return [...new Set(roots)];
}

class JailError extends Error {
  constructor(message) {
    super(message);
    this.name = 'JailError';
  }
}

function resolveJailed(input) {
  if (typeof input !== 'string' || input.length === 0) {
    throw new JailError('path must be a non-empty string');
  }
  const roots = allowedRoots();
  if (roots.length === 0) {
    throw new JailError(
      'no folders are shared with the assistant — the user must add one in Settings before files can be read'
    );
  }
  let candidate;
  if (path.isAbsolute(input)) {
    candidate = path.resolve(input);
  } else if (roots.length === 1) {
    candidate = path.resolve(roots[0], input); // relative resolves against the sole shared folder
  } else {
    throw new JailError(
      'a relative path is ambiguous with multiple shared folders — use an absolute path inside one of them'
    );
  }
  for (const root of roots) {
    if (candidate === root || candidate.startsWith(root + path.sep)) return candidate;
  }
  throw new JailError('path is outside every shared folder');
}

module.exports = { resolveJailed, allowedRoots, JailError };
