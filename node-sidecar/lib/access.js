'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const express = require('express');
const allowlist = require('../mcp/allowlist');
const browser = require('../mcp/browser');
const { inData } = require('./paths');

const AUDIT_LIMIT = 200;

function realOrSelf(target) {
  try { return fs.realpathSync(target); } catch (_) { return path.resolve(target); }
}

function directoryOrError(input) {
  if (typeof input !== 'string' || input.trim().length === 0) return { error: 'Enter a folder path.' };
  const resolved = path.resolve(input.trim());
  let stat;
  try { stat = fs.statSync(resolved); } catch (err) {
    if (err.code === 'ENOENT') return { error: `That folder does not exist: ${resolved}` };
    if (err.code === 'EACCES') return { error: `Windows would not let this app read ${resolved}` };
    return { error: `${err.code || 'ERR'}: ${err.message}` };
  }
  if (!stat.isDirectory()) return { error: 'That path is a file. Share the folder that contains it instead.' };
  return { path: realOrSelf(resolved) };
}

function folderState() {
  const writable = new Set(allowlist.writable());
  return allowlist.list().map((folder) => {
    let exists = true;
    try { fs.statSync(folder); } catch (_) { exists = false; }
    return { path: folder, writable: writable.has(folder), exists };
  });
}

function trashRoot() { return inData('mcp-trash'); }

function trashEntries() {
  let buckets;
  try { buckets = fs.readdirSync(trashRoot(), { withFileTypes: true }); } catch (_) { return []; }
  const items = [];
  for (const bucket of buckets) {
    if (!bucket.isDirectory()) continue;
    const dir = path.join(trashRoot(), bucket.name);
    let origin = null;
    try { origin = JSON.parse(fs.readFileSync(path.join(dir, 'origin.json'), 'utf8')); } catch (_) {  }
    if (!origin || !origin.original_path) continue;
    const name = path.basename(origin.original_path);
    const stored = path.join(dir, name);
    let exists = true;
    try { fs.lstatSync(stored); } catch (_) { exists = false; }
    if (!exists) continue;
    items.push({ id: bucket.name, name, original_path: origin.original_path, moved_at: origin.moved_at || null });
  }
  return items.sort((a, b) => String(b.moved_at || '').localeCompare(String(a.moved_at || '')));
}

function auditTail(limit) {
  let raw;
  try { raw = fs.readFileSync(inData('mcp-audit.log'), 'utf8'); } catch (_) { return []; }
  const lines = raw.trim().split('\n').filter(Boolean);
  const wanted = Math.min(Number(limit) || 50, AUDIT_LIMIT);
  return lines.slice(-wanted).reverse().map((line) => {
    try { return JSON.parse(line); } catch (_) { return null; }
  }).filter(Boolean);
}

function normalizeDomain(input) {
  if (typeof input !== 'string') return null;
  let value = input.trim().toLowerCase();
  if (!value) return null;
  if (value.includes('://')) {
    try { value = new URL(value).hostname; } catch (_) { return null; }
  }
  value = value.replace(/^www\./, '').replace(/^\.+/, '').replace(/\/.*$/, '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(value)) return null;
  return value;
}

function router() {
  const api = express.Router();
  api.use(express.json({ limit: '32kb' }));

  api.get('/state', async (_req, res) => {
    let reachable = false;
    let detail = null;
    try { await browser.version(); reachable = true; } catch (err) { detail = err.message; }
    res.json({
      folders: folderState(),
      browser: { domains: browser.domains(), port: browser.port(), reachable, detail },
      trash_count: trashEntries().length,
      home: os.homedir(),
    });
  });

  api.get('/browse', (req, res) => {
    const start = req.query.path ? String(req.query.path) : os.homedir();
    const checked = directoryOrError(start);
    if (checked.error) return res.status(400).json({ error: checked.error });
    let dirents;
    try { dirents = fs.readdirSync(checked.path, { withFileTypes: true }); } catch (err) {
      return res.status(400).json({ error: `Cannot open that folder: ${err.code || err.message}` });
    }
    const folders = dirents
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => ({ name: d.name, path: path.join(checked.path, d.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const parent = path.dirname(checked.path);
    res.json({ path: checked.path, parent: parent === checked.path ? null : parent, folders });
  });

  api.post('/folders', (req, res) => {
    const checked = directoryOrError(req.body && req.body.path);
    if (checked.error) return res.status(400).json({ error: checked.error });
    allowlist.add(checked.path);
    res.json({ folders: folderState() });
  });

  api.delete('/folders', (req, res) => {
    const target = req.body && req.body.path;
    if (typeof target !== 'string' || !target) return res.status(400).json({ error: 'Which folder?' });
    allowlist.remove(target);
    res.json({ folders: folderState() });
  });

  api.post('/folders/write', (req, res) => {
    const target = req.body && req.body.path;
    if (typeof target !== 'string' || !target) return res.status(400).json({ error: 'Which folder?' });
    if (!allowlist.list().includes(target)) return res.status(400).json({ error: 'Share that folder before approving writing.' });
    if (req.body.allowed) allowlist.allowWrite(target);
    else allowlist.denyWrite(target);
    res.json({ folders: folderState() });
  });

  api.post('/websites', (req, res) => {
    const domain = normalizeDomain(req.body && req.body.domain);
    if (!domain) return res.status(400).json({ error: 'Enter a website like example.com.' });
    res.json({ domains: browser.saveDomains([...browser.domains(), domain]) });
  });

  api.delete('/websites', (req, res) => {
    const domain = normalizeDomain(req.body && req.body.domain);
    if (!domain) return res.status(400).json({ error: 'Which website?' });
    res.json({ domains: browser.saveDomains(browser.domains().filter((d) => d !== domain)) });
  });

  api.get('/audit', (req, res) => {
    res.json({ events: auditTail(req.query.limit) });
  });

  api.get('/trash', (_req, res) => {
    res.json({ items: trashEntries() });
  });

  api.post('/trash/restore', (req, res) => {
    const id = req.body && req.body.id;
    const entry = trashEntries().find((item) => item.id === id);
    if (!entry) return res.status(404).json({ error: 'That item is no longer in the trash.' });
    const stored = path.join(trashRoot(), entry.id, entry.name);
    if (fs.existsSync(entry.original_path)) {
      return res.status(409).json({ error: `Something already exists at ${entry.original_path}. Move or rename it first.` });
    }
    try {
      fs.mkdirSync(path.dirname(entry.original_path), { recursive: true });
      fs.renameSync(stored, entry.original_path);
      fs.rmSync(path.join(trashRoot(), entry.id), { recursive: true, force: true });
    } catch (err) {
      return res.status(500).json({ error: `Restore failed: ${err.code || err.message}` });
    }
    res.json({ restored: entry.original_path, items: trashEntries() });
  });

  return api;
}

module.exports = { router, normalizeDomain, directoryOrError, trashEntries, auditTail, folderState };
