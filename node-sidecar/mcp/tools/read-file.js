'use strict';

const fs = require('fs').promises;
const { resolveJailed, JailError } = require('../jail');
const audit = require('../audit');

const MAX_BYTES = 1024 * 1024; // 1 MiB cap — model context isn't infinite.

module.exports = {
  name: 'read_file',
  definition: {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Read a UTF-8 text file from a folder the user has shared with you. ' +
        'Paths may be absolute, or relative when exactly one folder is shared. ' +
        'Files larger than 1 MiB are truncated; binary files return an error. ' +
        'Use list_directory first to discover the shared folders and paths.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path inside a shared folder (absolute, or relative when one folder is shared).' },
        },
        required: ['path'],
      },
    },
  },
  async execute({ path: input }) {
    let resolved;
    try {
      resolved = resolveJailed(input);
    } catch (err) {
      if (err instanceof JailError) return { error: err.message };
      throw err;
    }
    try {
      const stat = await fs.stat(resolved);
      if (!stat.isFile()) return { error: `not a file: ${input}` };
      const buf = await fs.readFile(resolved);
      const truncated = buf.length > MAX_BYTES;
      const slice = truncated ? buf.subarray(0, MAX_BYTES) : buf;
      if (slice.includes(0)) return { error: `binary file: ${input}` };
      audit.record({ tool: 'read_file', path: resolved, bytes: buf.length });
      return {
        path: resolved,
        size_bytes: buf.length,
        truncated,
        content: slice.toString('utf8'),
      };
    } catch (err) {
      if (err.code === 'ENOENT') return { error: `not found: ${input}` };
      if (err.code === 'EACCES') return { error: `permission denied: ${input}` };
      return { error: `${err.code || 'ERR'}: ${err.message}` };
    }
  },
};
