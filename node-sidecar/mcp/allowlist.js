'use strict';

// The user's folder allowlist for the filesystem MCP tools. A JSON file under
// the data dir — {"folders": ["C:\\Users\\me\\Documents", ...]} — written by the
// desktop's folder picker. It is a USER action only (never an assistant tool),
// so the AI can't widen its own reach. jail.js reads this to enforce default-deny.

const fs = require('fs');
const { inData } = require('../lib/paths');

function file() { return inData('mcp-allowlist.json'); }

function list() {
  try {
    const data = JSON.parse(fs.readFileSync(file(), 'utf8'));
    const folders = Array.isArray(data && data.folders) ? data.folders : [];
    return folders.filter((f) => typeof f === 'string' && f.length > 0);
  } catch (_) { return []; }
}

function save(folders) {
  const unique = [...new Set(folders.filter((f) => typeof f === 'string' && f.length > 0))];
  fs.writeFileSync(file(), JSON.stringify({ folders: unique }, null, 2));
  return unique;
}

function add(folder) { return save([...list(), folder]); }
function remove(folder) { return save(list().filter((f) => f !== folder)); }

module.exports = { list, add, remove, save, file };
