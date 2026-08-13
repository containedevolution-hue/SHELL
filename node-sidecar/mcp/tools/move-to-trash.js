'use strict';

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { resolveWritable, JailError } = require('../jail');
const { inData } = require('../../lib/paths');
const audit = require('../audit');

module.exports = {
  name: 'move_to_trash',
  definition: {
    type: 'function',
    function: {
      name: 'move_to_trash',
      description:
        'Move a file or folder out of a write-approved folder into this machine\'s LocalHub trash. ' +
        'Nothing is erased: the item keeps its contents and the reply reports where it went so the user can restore it. ' +
        'There is no tool that permanently deletes anything.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File or folder path inside a folder approved for writing.' },
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
      const stat = await fs.lstat(resolved);
      const bucket = inData('mcp-trash', `${stamp()}-${crypto.randomBytes(4).toString('hex')}`);
      await fs.mkdir(bucket, { recursive: true });
      const landing = path.join(bucket, path.basename(resolved));
      await fs.rename(resolved, landing);
      await fs.writeFile(
        path.join(bucket, 'origin.json'),
        JSON.stringify({ original_path: resolved, moved_at: new Date().toISOString() }, null, 2)
      );
      audit.record({ tool: 'move_to_trash', path: resolved, trash_path: landing });
      return {
        moved: true,
        original_path: resolved,
        trash_path: landing,
        kind: stat.isDirectory() ? 'directory' : 'file',
      };
    } catch (err) {
      if (err.code === 'ENOENT') return { error: `not found: ${input}` };
      if (err.code === 'EACCES' || err.code === 'EPERM') return { error: `permission denied: ${input}` };
      if (err.code === 'EBUSY') return { error: `in use by another program: ${input}` };
      if (err.code === 'EXDEV') return { error: `cannot move across drives: ${input}` };
      return { error: `${err.code || 'ERR'}: ${err.message}` };
    }
  },
};

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
