'use strict';

const fs = require('fs').promises;
const path = require('path');
const { resolveJailed, JailError, allowedRoots } = require('../jail');
const audit = require('../audit');

const MAX_RESULTS = 100;
const MAX_DEPTH = 12;
const MAX_CONTENT_BYTES = 512 * 1024;
const MAX_VISITS = 20000;

module.exports = {
  name: 'search_files',
  definition: {
    type: 'function',
    function: {
      name: 'search_files',
      description:
        'Find files by name, and optionally by the text inside them, within the folders the user has shared. ' +
        'Matching is case-insensitive substring matching, not glob or regex. ' +
        'Returns at most 100 results. Use this instead of listing folder after folder.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Text to look for in file names.' },
          contains: { type: 'string', description: 'Optional text that must also appear inside the file.' },
          path: { type: 'string', description: 'Optional folder to search inside. Defaults to every shared folder.' },
        },
        required: ['query'],
      },
    },
  },
  async execute({ query, contains, path: input } = {}) {
    if (typeof query !== 'string' || query.length === 0) return { error: 'query must be a non-empty string' };

    let roots;
    if (input) {
      try {
        roots = [resolveJailed(input)];
      } catch (err) {
        if (err instanceof JailError) return { error: err.message };
        throw err;
      }
    } else {
      roots = allowedRoots();
      if (roots.length === 0) {
        return { error: 'no folders are shared with the assistant — the user must add one in Settings before files can be searched' };
      }
    }

    const needle = query.toLowerCase();
    const body = typeof contains === 'string' && contains.length ? contains.toLowerCase() : null;
    const matches = [];
    const budget = { visits: MAX_VISITS };
    let truncated = false;

    for (const root of roots) {
      if (matches.length >= MAX_RESULTS) { truncated = true; break; }
      const hitLimit = await walk(root, 0, needle, body, matches, budget);
      if (hitLimit) { truncated = true; break; }
    }

    audit.record({ tool: 'search_files', query, contains: body ? true : false, count: matches.length });
    return { count: matches.length, truncated, matches };
  },
};

async function walk(dir, depth, needle, body, matches, budget) {
  if (depth > MAX_DEPTH) return false;
  let dirents;
  try { dirents = await fs.readdir(dir, { withFileTypes: true }); } catch (_) { return false; }
  for (const entry of dirents) {
    if (matches.length >= MAX_RESULTS) return true;
    if (budget.visits-- <= 0) return true;
    if (entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (await walk(full, depth + 1, needle, body, matches, budget)) return true;
      continue;
    }
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().includes(needle)) continue;
    let stat;
    try { stat = await fs.stat(full); } catch (_) { continue; }
    if (body && !(await fileContains(full, stat.size, body))) continue;
    matches.push({ path: full, name: entry.name, size_bytes: stat.size });
  }
  return false;
}

async function fileContains(file, size, body) {
  if (size > MAX_CONTENT_BYTES) return false;
  try {
    const buf = await fs.readFile(file);
    if (buf.includes(0)) return false;
    return buf.toString('utf8').toLowerCase().includes(body);
  } catch (_) { return false; }
}
