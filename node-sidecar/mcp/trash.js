'use strict';

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { inData } = require('../lib/paths');

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function moveIntoTrash(resolved) {
  const bucket = inData('mcp-trash', `${stamp()}-${crypto.randomBytes(4).toString('hex')}`);
  await fs.mkdir(bucket, { recursive: true });
  const landing = path.join(bucket, path.basename(resolved));
  await fs.rename(resolved, landing);
  await fs.writeFile(
    path.join(bucket, 'origin.json'),
    JSON.stringify({ original_path: resolved, moved_at: new Date().toISOString() }, null, 2)
  );
  return landing;
}

module.exports = { moveIntoTrash };
