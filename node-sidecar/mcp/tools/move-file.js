'use strict';

const fs = require('fs').promises;
const path = require('path');
const { resolveWritable, JailError } = require('../jail');
const { moveIntoTrash } = require('../trash');
const audit = require('../audit');

module.exports = {
  name: 'move_file',
  definition: {
    type: 'function',
    function: {
      name: 'move_file',
      description:
        'Move or rename a file or folder. Both where it comes from and where it goes must be inside ' +
        'folders the user approved for writing. Rename by keeping the same parent folder and changing ' +
        'the last part of the path. This never replaces anything: if something already exists at the ' +
        'destination the move is refused, so move that item to the trash first if it should go.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Current path of the file or folder.' },
          to: { type: 'string', description: 'New full path, including the new name.' },
        },
        required: ['from', 'to'],
      },
    },
  },
  async execute({ from, to } = {}) {
    let source;
    let target;
    try {
      source = resolveWritable(from);
      target = resolveWritable(to);
    } catch (err) {
      if (err instanceof JailError) return { error: err.message };
      throw err;
    }

    if (source === target) return { error: 'the source and destination are the same place' };
    if (target.startsWith(source + path.sep)) return { error: 'a folder cannot be moved inside itself' };

    try {
      await fs.lstat(source);
    } catch (err) {
      if (err.code === 'ENOENT') return { error: `not found: ${from}` };
      return { error: `${err.code || 'ERR'}: ${err.message}` };
    }

    let clashes = true;
    try { await fs.lstat(target); } catch (_) { clashes = false; }
    if (clashes) return { error: `already exists: ${to} — move that item to the trash first if it should be replaced` };

    try {
      await fs.mkdir(path.dirname(target), { recursive: true });
      try {
        await fs.rename(source, target);
      } catch (err) {
        if (err.code !== 'EXDEV') throw err;
        await fs.cp(source, target, { recursive: true, errorOnExist: true, force: false });
        await moveIntoTrash(source);
      }
      audit.record({ tool: 'move_file', path: source, to: target });
      return { moved: true, from: source, to: target };
    } catch (err) {
      if (err.code === 'EACCES' || err.code === 'EPERM') return { error: `permission denied: ${from}` };
      if (err.code === 'EBUSY') return { error: `in use by another program: ${from}` };
      if (err.code === 'ENOSPC') return { error: 'no space left on the device' };
      return { error: `${err.code || 'ERR'}: ${err.message}` };
    }
  },
};
