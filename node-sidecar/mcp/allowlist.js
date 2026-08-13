'use strict';

const fs = require('fs');
const { inData } = require('../lib/paths');

function file() { return inData('mcp-allowlist.json'); }

function read() {
  try { return JSON.parse(fs.readFileSync(file(), 'utf8')) || {}; } catch (_) { return {}; }
}

function clean(value) {
  const items = Array.isArray(value) ? value : [];
  return items.filter((f) => typeof f === 'string' && f.length > 0);
}

function list() { return clean(read().folders); }

function writable() {
  const folders = new Set(list());
  return clean(read().writable).filter((f) => folders.has(f));
}

function persist(folders, writableFolders) {
  const uniqueFolders = [...new Set(clean(folders))];
  const allowed = new Set(uniqueFolders);
  const uniqueWritable = [...new Set(clean(writableFolders))].filter((f) => allowed.has(f));
  fs.writeFileSync(file(), JSON.stringify({ folders: uniqueFolders, writable: uniqueWritable }, null, 2));
  return uniqueFolders;
}

function save(folders) { return persist(folders, writable()); }
function add(folder) { return save([...list(), folder]); }
function remove(folder) { return persist(list().filter((f) => f !== folder), writable().filter((f) => f !== folder)); }

function allowWrite(folder) { persist(list(), [...writable(), folder]); return writable(); }
function denyWrite(folder) { persist(list(), writable().filter((f) => f !== folder)); return writable(); }

module.exports = { list, writable, add, remove, save, allowWrite, denyWrite, file };
