'use strict';

const fs = require('fs').promises;
const path = require('path');
const { resolveWritable, JailError } = require('../jail');
const audit = require('../audit');

const MAX_BYTES = 1024 * 1024;

module.exports = {
  name: 'write_file',
  definition: {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        'Write a UTF-8 text file into a folder the user has approved for writing. ' +
        'Sharing a folder for reading does not approve it for writing; the user approves that separately. ' +
        'Use mode "create" to refuse an existing file, "overwrite" to replace it, or "append" to add to the end. ' +
        'Content is limited to 1 MiB. Missing parent folders are created inside the approved folder.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path inside a folder approved for writing.' },
          content: { type: 'string', description: 'UTF-8 text to write.' },
          mode: {
            type: 'string',
            enum: ['create', 'overwrite', 'append'],
            description: 'create refuses an existing file, overwrite replaces it, append adds to the end. Defaults to create.',
          },
        },
        required: ['path', 'content'],
      },
    },
  },
  async execute({ path: input, content, mode } = {}) {
    if (typeof content !== 'string') return { error: 'content must be a string' };
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > MAX_BYTES) return { error: `content is ${bytes} bytes; the limit is ${MAX_BYTES}` };
    const how = mode || 'create';
    if (!['create', 'overwrite', 'append'].includes(how)) return { error: `unknown mode: ${mode}` };

    let resolved;
    try {
      resolved = resolveWritable(input);
    } catch (err) {
      if (err instanceof JailError) return { error: err.message };
      throw err;
    }

    try {
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      const flag = how === 'append' ? 'a' : how === 'overwrite' ? 'w' : 'wx';
      await fs.writeFile(resolved, content, { encoding: 'utf8', flag });
      const stat = await fs.stat(resolved);
      audit.record({ tool: 'write_file', path: resolved, mode: how, bytes });
      return { path: resolved, mode: how, bytes_written: bytes, size_bytes: stat.size };
    } catch (err) {
      if (err.code === 'EEXIST') return { error: `already exists: ${input} — pass mode "overwrite" or "append" to change it` };
      if (err.code === 'EISDIR') return { error: `not a file: ${input}` };
      if (err.code === 'EACCES' || err.code === 'EPERM') return { error: `permission denied: ${input}` };
      if (err.code === 'ENOSPC') return { error: `no space left on the device` };
      return { error: `${err.code || 'ERR'}: ${err.message}` };
    }
  },
};
