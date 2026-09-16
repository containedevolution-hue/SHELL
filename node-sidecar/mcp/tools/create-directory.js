'use strict';

const fs = require('fs').promises;
const { resolveWritable, JailError } = require('../jail');
const audit = require('../audit');

module.exports = {
  name: 'create_directory',
  definition: {
    type: 'function',
    function: {
      name: 'create_directory',
      description:
        'Create a folder inside a folder the user has approved for writing. ' +
        'Missing parent folders are created too. Succeeds quietly if the folder already exists.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Folder path inside a folder approved for writing.' },
        },
        required: ['path'],
      },
    },
  },
  async execute({ path: input } = {}) {
    let resolved;
    try {
      resolved = resolveWritable(input);
    } catch (err) {
      if (err instanceof JailError) return { error: err.message };
      throw err;
    }
    try {
      const created = await fs.mkdir(resolved, { recursive: true });
      audit.record({ tool: 'create_directory', path: resolved, created: !!created });
      return { path: resolved, created: !!created };
    } catch (err) {
      if (err.code === 'ENOTDIR') return { error: `a file already exists on that path: ${input}` };
      if (err.code === 'EACCES' || err.code === 'EPERM') return { error: `permission denied: ${input}` };
      return { error: `${err.code || 'ERR'}: ${err.message}` };
    }
  },
};
