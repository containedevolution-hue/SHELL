'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const express = require('express');

const MAX_ASSET_BYTES = 250 * 1024 * 1024;
const SCRIPT_DIR = path.join(__dirname, '..', 'asset-forge');

function createAssetForgeRouter(options = {}) {
  const dataDir = options.dataDir || require('./paths').dataDir();
  const cloudBase = options.cloudBase || process.env.CE_CLOUD_BASE || 'https://app.containedevolution.com';
  const workspaceRoot = path.join(dataDir, 'asset-forge');
  fs.mkdirSync(workspaceRoot, { recursive: true });

  const router = express.Router();
  const raw = express.raw({
    type: ['model/gltf-binary', 'application/octet-stream', 'application/x-ce-asset'],
    limit: MAX_ASSET_BYTES,
  });

  router.use(async (req, res, next) => {
    const authorization = req.headers.authorization || '';
    if (!authorization.startsWith('Bearer ')) return res.status(401).json({ error: 'admin_session_required' });
    try {
      const response = await fetch(`${cloudBase}/api/auth/me`, {
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return res.status(response.status === 401 ? 401 : 502).json({ error: 'admin_verification_failed' });
      const user = await response.json();
      if (!user.is_admin) return res.status(403).json({ error: 'admin_access_required' });
      req.ceUser = user;
      next();
    } catch (error) {
      res.status(502).json({ error: `admin_verification_unavailable: ${error.message}` });
    }
  });

  router.get('/health', (_req, res) => {
    const blender = findBlender();
    res.json({
      ok: true,
      blender_available: Boolean(blender),
      blender_path: blender || null,
      blender_version: blender ? blenderVersion(blender) : null,
    });
  });

  router.post('/repair', raw, async (req, res) => {
    const blender = findBlender();
    if (!blender) return res.status(503).json({ error: 'Blender was not found. Install Blender or set BLENDER_BIN.' });
    try {
      const glb = requireGlb(req.body);
      const job = createWorkspace(workspaceRoot);
      const source = path.join(job.dir, 'source.glb');
      const output = path.join(job.dir, 'repaired.glb');
      const report = path.join(job.dir, 'repair-report.json');
      fs.writeFileSync(source, glb);
      const args = [
        '--background',
        '--python', path.join(SCRIPT_DIR, 'repair.py'),
        '--',
        '--input', source,
        '--output', output,
        '--report', report,
        '--normals', boolArg(req.query.normals, true),
        '--smooth', boolArg(req.query.smooth, true),
        '--merge', boolArg(req.query.merge, false),
        '--loose', boolArg(req.query.loose, false),
      ];
      await runBlender(blender, args, job.dir);
      if (!fs.existsSync(output)) throw new Error('Blender did not produce a repaired GLB.');
      const repaired = fs.readFileSync(output);
      requireGlb(repaired);
      res.set({
        'Content-Type': 'model/gltf-binary',
        'Content-Disposition': `attachment; filename="${job.id}-repaired.glb"`,
        'X-CE-Asset-Job': job.id,
      });
      res.send(repaired);
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message || 'repair_failed' });
    }
  });

  router.post('/power-edit', raw, (req, res) => {
    const blender = findBlender();
    if (!blender) return res.status(503).json({ error: 'Blender was not found. Install Blender or set BLENDER_BIN.' });
    try {
      const envelope = parseEnvelope(req.body);
      const glb = requireGlb(envelope.glb);
      const job = createWorkspace(workspaceRoot);
      const source = path.join(job.dir, 'source.glb');
      const blend = path.join(job.dir, 'power-edit.blend');
      const manifest = path.join(job.dir, 'selection.json');
      fs.writeFileSync(source, glb);
      fs.writeFileSync(manifest, JSON.stringify(envelope.metadata, null, 2), 'utf8');

      const child = spawn(blender, [
        '--python', path.join(SCRIPT_DIR, 'power-edit.py'),
        '--',
        '--input', source,
        '--blend', blend,
        '--manifest', manifest,
      ], {
        cwd: job.dir,
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
      child.unref();
      res.status(202).json({ ok: true, job_id: job.id, workspace: job.dir });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message || 'power_edit_failed' });
    }
  });

  router.use((error, _req, res, next) => {
    if (!error) return next();
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'asset_exceeds_250mb_limit' });
    return res.status(400).json({ error: error.message || 'invalid_asset_request' });
  });

  return router;
}

function createWorkspace(root) {
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`;
  const dir = path.resolve(root, id);
  const resolvedRoot = path.resolve(root) + path.sep;
  if (!dir.startsWith(resolvedRoot)) throw new Error('Invalid asset workspace path.');
  fs.mkdirSync(dir, { recursive: false });
  return { id, dir };
}

function parseEnvelope(body) {
  if (!Buffer.isBuffer(body) || body.length < 24) throw httpError(400, 'Invalid CE asset envelope.');
  const jsonLength = body.readUInt32LE(0);
  if (jsonLength > 4 * 1024 * 1024 || 4 + jsonLength >= body.length) throw httpError(400, 'Invalid CE asset metadata length.');
  let metadata;
  try {
    metadata = JSON.parse(body.subarray(4, 4 + jsonLength).toString('utf8'));
  } catch {
    throw httpError(400, 'Invalid CE asset metadata JSON.');
  }
  return { metadata, glb: body.subarray(4 + jsonLength) };
}

function requireGlb(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value || []);
  if (buffer.length < 20 || buffer.readUInt32LE(0) !== 0x46546c67) throw httpError(400, 'A valid GLB file is required.');
  if (buffer.readUInt32LE(4) !== 2) throw httpError(400, 'Only glTF 2.0 GLB files are supported.');
  if (buffer.readUInt32LE(8) !== buffer.length) throw httpError(400, 'GLB length header does not match the upload.');
  return buffer;
}

function boolArg(value, defaultValue) {
  if (value === undefined) return defaultValue ? '1' : '0';
  return value === '1' || value === 'true' ? '1' : '0';
}

function findBlender() {
  const configured = process.env.BLENDER_BIN;
  if (configured && fs.existsSync(configured)) return configured;

  const command = process.platform === 'win32' ? 'where.exe' : 'which';
  const located = spawnSync(command, ['blender'], { encoding: 'utf8', windowsHide: true });
  if (located.status === 0) {
    const first = String(located.stdout || '').split(/\r?\n/).find(Boolean);
    if (first && fs.existsSync(first.trim())) return first.trim();
  }

  if (process.platform === 'win32') {
    const foundation = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Blender Foundation');
    if (fs.existsSync(foundation)) {
      const candidates = fs.readdirSync(foundation, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => path.join(foundation, entry.name, 'blender.exe'))
        .filter(candidate => fs.existsSync(candidate))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      if (candidates.length) return candidates[0];
    }
  }
  return null;
}

function blenderVersion(executable) {
  const result = spawnSync(executable, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  const match = String(result.stdout || '').match(/Blender\s+([0-9.]+)/i);
  return match ? match[1] : null;
}

function runBlender(executable, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, windowsHide: true });
    let stderr = '';
    child.stderr.on('data', chunk => {
      stderr = (stderr + chunk.toString()).slice(-12000);
    });
    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`Blender repair exited with code ${code}.${stderr ? ` ${stderr.trim()}` : ''}`));
    });
  });
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = {
  createAssetForgeRouter,
  findBlender,
  parseEnvelope,
  requireGlb,
};
