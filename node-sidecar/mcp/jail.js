'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const allowlist = require('./allowlist');

class JailError extends Error {
  constructor(message) {
    super(message);
    this.name = 'JailError';
  }
}

function real(target) {
  try { return fs.realpathSync(target); } catch (_) { return path.resolve(target); }
}

function allowedRoots() {
  const roots = [];
  if (process.env.MCP_ROOT) roots.push(real(process.env.MCP_ROOT));
  for (const f of allowlist.list()) roots.push(real(f));
  if (roots.length === 0 && process.env.LOCALHUB_HOST === '0.0.0.0') {
    roots.push(real(os.homedir()));
  }
  return [...new Set(roots)];
}

function writableRoots() {
  const shared = new Set(allowedRoots());
  return allowlist.writable().map(real).filter((r) => shared.has(r));
}

function realizeCandidate(candidate) {
  const tail = [];
  let current = candidate;
  for (;;) {
    try {
      const resolved = fs.realpathSync(current);
      return tail.length ? path.join(resolved, ...tail.slice().reverse()) : resolved;
    } catch (err) {
      if (err.code !== 'ENOENT') throw new JailError(`path cannot be resolved: ${err.code || err.message}`);
      const parent = path.dirname(current);
      if (parent === current) throw new JailError('path cannot be resolved to a real location');
      tail.push(path.basename(current));
      current = parent;
    }
  }
}

function contains(roots, candidate) {
  return roots.some((root) => candidate === root || candidate.startsWith(root + path.sep));
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
  const resolved = realizeCandidate(candidate);
  if (!contains(roots, resolved)) throw new JailError('path is outside every shared folder');
  return resolved;
}

function resolveWritable(input) {
  const resolved = resolveJailed(input);
  const writable = writableRoots();
  if (writable.length === 0) {
    throw new JailError(
      'no folders are approved for writing — the user must approve write access for a shared folder in Settings'
    );
  }
  if (!contains(writable, resolved)) throw new JailError('path is inside a read-only shared folder');
  return resolved;
}

module.exports = { resolveJailed, resolveWritable, allowedRoots, writableRoots, JailError };
