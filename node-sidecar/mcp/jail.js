'use strict';

const path = require('path');
const os = require('os');
const allowlist = require('./allowlist');

function allowedRoots() {
  const roots = [];
  if (process.env.MCP_ROOT) roots.push(path.resolve(process.env.MCP_ROOT));
  for (const f of allowlist.list()) roots.push(path.resolve(f));
  if (roots.length === 0 && process.env.LOCALHUB_HOST === '0.0.0.0') {
    roots.push(path.resolve(os.homedir())); 
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
    candidate = path.resolve(roots[0], input); 
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
