'use strict';

// Path jail for filesystem tools. MCP_ROOT env defines the only subtree the
// MCP tools may touch — default = the service user's home dir on the Pi.
// Every path the model supplies is resolved (absolute or relative-to-root),
// then rejected if it escapes the root. Symlinks are NOT followed for the
// containment check — we use path.resolve, not fs.realpath — because the
// alternative (resolve symlinks before checking) lets the cloud PA enumerate
// outside the root by reading a symlink the user planted. Acceptable for A2's
// read-only triplet; revisit if write tools land before A5 brings real auth.

const path = require('path');
const os = require('os');

const ROOT = path.resolve(process.env.MCP_ROOT || os.homedir());

function resolveJailed(input) {
  if (typeof input !== 'string' || input.length === 0) {
    throw new JailError('path must be a non-empty string');
  }
  const candidate = path.isAbsolute(input)
    ? path.resolve(input)
    : path.resolve(ROOT, input);
  if (candidate !== ROOT && !candidate.startsWith(ROOT + path.sep)) {
    throw new JailError(`path escapes MCP_ROOT (${ROOT})`);
  }
  return candidate;
}

class JailError extends Error {
  constructor(message) {
    super(message);
    this.name = 'JailError';
  }
}

module.exports = { resolveJailed, ROOT, JailError };
