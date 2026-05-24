'use strict';

const fs = require('fs').promises;
const path = require('path');
const { resolveJailed, JailError } = require('../jail');

module.exports = {
  name: 'list_directory',
  definition: {
    type: 'function',
    function: {
      name: 'list_directory',
      description:
        'List entries in a directory on the appliance filesystem. ' +
        'Paths may be absolute or relative to MCP_ROOT. ' +
        'Returns each entry with name + type (file/directory/symlink/other) + size_bytes for files.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path (absolute or relative to MCP_ROOT). Defaults to MCP_ROOT.' },
        },
      },
    },
  },
  async execute({ path: input = '.' } = {}) {
    let resolved;
    try {
      resolved = resolveJailed(input);
    } catch (err) {
      if (err instanceof JailError) return { error: err.message };
      throw err;
    }
    try {
      const dirents = await fs.readdir(resolved, { withFileTypes: true });
      const entries = await Promise.all(dirents.map(async (d) => {
        const entry = { name: d.name, type: kindOf(d) };
        if (d.isFile()) {
          try {
            const s = await fs.stat(path.join(resolved, d.name));
            entry.size_bytes = s.size;
          } catch { /* unreadable file — skip size */ }
        }
        return entry;
      }));
      entries.sort((a, b) => a.name.localeCompare(b.name));
      return { path: resolved, count: entries.length, entries };
    } catch (err) {
      if (err.code === 'ENOENT') return { error: `not found: ${input}` };
      if (err.code === 'ENOTDIR') return { error: `not a directory: ${input}` };
      if (err.code === 'EACCES') return { error: `permission denied: ${input}` };
      return { error: `${err.code || 'ERR'}: ${err.message}` };
    }
  },
};

function kindOf(d) {
  if (d.isFile()) return 'file';
  if (d.isDirectory()) return 'directory';
  if (d.isSymbolicLink()) return 'symlink';
  return 'other';
}
