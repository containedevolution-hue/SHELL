'use strict';

const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { Readable } = require('stream');

const { cleanupSystem, commandSystem, commandUser } = require('../../../lib/flow-prompts');

const OLLAMA_BASE   = process.env.OLLAMA_BASE || 'http://127.0.0.1:11434';
const OLLAMA_MODEL  = process.env.OLLAMA_MODEL || 'llama3.2';
const MODEL_NAME    = process.env.WHISPER_MODEL || 'ggml-base.en.bin';

const MODEL_URL     = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/' + MODEL_NAME;
const STT_TIMEOUT   = 60000;   
const LLM_TIMEOUT   = 60000;

function modelDir() {
  return process.env.WHISPER_MODEL_DIR || require('./paths').inData('whisper');
}
function modelPath() { return path.join(modelDir(), MODEL_NAME); }

function whisperBin() { return process.env.WHISPER_BIN || path.join(modelDir(), 'whisper-cli'); }

function whisperReady() {
  try {
    const bin = whisperBin();
    return !!bin && fs.existsSync(bin) && fs.existsSync(modelPath());
  } catch (_) { return false; }
}

async function ollamaReady() {
  try {
    const r = await fetch(OLLAMA_BASE + '/api/tags', { signal: AbortSignal.timeout(2500) });
    return r.ok;
  } catch (_) { return false; }
}

function transcribe(wavBuffer) {
  return new Promise((resolve, reject) => {
    const bin = whisperBin();
    if (!bin) return reject({ code: 503, msg: 'whisper not configured on this host.' });
    if (!fs.existsSync(modelPath())) return reject({ code: 503, msg: 'whisper model not downloaded yet.' });

    const stamp = crypto.randomBytes(6).toString('hex');
    const base  = path.join(os.tmpdir(), 'ce-flow-' + stamp);
    const wav   = base + '.wav';
    const txt   = base + '.txt';   
    try { fs.writeFileSync(wav, wavBuffer); } catch (e) { return reject({ code: 500, msg: 'temp write failed.' }); }

    const cleanup = () => { for (const f of [wav, txt]) { try { fs.unlinkSync(f); } catch (_) {} } };

    const args = ['-m', modelPath(), '-f', wav, '-otxt', '-nt', '-np', '-of', base];
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); if (stderr.length > 4000) stderr = stderr.slice(-4000); });

    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) {} }, STT_TIMEOUT);
    child.on('error', (err) => { clearTimeout(timer); cleanup(); reject({ code: 500, msg: 'whisper failed to start: ' + err.message }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      let out = '';
      try { out = fs.readFileSync(txt, 'utf8'); } catch (_) {}
      cleanup();
      if (code !== 0 && !out) return reject({ code: 502, msg: 'whisper error' + (stderr ? ': ' + stderr.slice(-160) : '.') });
      resolve(out.replace(/\s+/g, ' ').trim());
    });
  });
}

async function ollamaChat(model, messages) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LLM_TIMEOUT);
  try {
    const r = await fetch(OLLAMA_BASE + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false, options: { temperature: 0.2 } }),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      if (r.status === 404) throw { code: 404, msg: 'Ollama model "' + model + '" not pulled. Run: ollama pull ' + model };
      throw { code: 502, msg: 'Ollama error (' + r.status + ').' + (body ? ' ' + body.slice(0, 160) : '') };
    }
    const d = await r.json().catch(() => ({}));
    return String((d && d.message && d.message.content) || '').trim();
  } catch (err) {
    if (err && err.code) throw err;
    if (err && err.name === 'AbortError') throw { code: 504, msg: 'Ollama timed out.' };
    throw { code: 502, msg: 'Could not reach Ollama at ' + OLLAMA_BASE + '. Is it running?' };
  } finally {
    clearTimeout(timer);
  }
}

let downloading = false;
async function downloadModel() {
  if (whisperReady() || fs.existsSync(modelPath())) return { ok: true, already: true };
  if (downloading) return { ok: true, downloading: true };
  downloading = true;
  try {
    fs.mkdirSync(modelDir(), { recursive: true });
    const res = await fetch(MODEL_URL, { redirect: 'follow' });
    if (!res.ok || !res.body) throw new Error('download failed (' + res.status + ')');
    const tmp = modelPath() + '.part';
    await new Promise((resolve, reject) => {
      const ws = fs.createWriteStream(tmp);
      Readable.fromWeb(res.body).pipe(ws);
      ws.on('finish', resolve);
      ws.on('error', reject);
    });
    fs.renameSync(tmp, modelPath());
    return { ok: true };
  } finally {
    downloading = false;
  }
}

function router() {
  const r = express.Router();
  const rawAudio = express.raw({ type: () => true, limit: '25mb' });
  const json = express.json({ limit: '256kb' });

  r.get('/health', async (_req, res) => {
    res.json({
      whisper: whisperReady(),
      ollama: await ollamaReady(),
      model: MODEL_NAME,
      ollamaModel: OLLAMA_MODEL,
      downloading,
    });
  });

  r.post('/model', async (_req, res) => {
    try { res.json(await downloadModel()); }
    catch (e) { res.status(502).json({ error: 'download', message: (e && e.message) || 'Model download failed.' }); }
  });

  r.post('/dictate', rawAudio, async (req, res) => {
    const buf = Buffer.isBuffer(req.body) ? req.body : null;
    if (!buf || !buf.length) return res.status(400).json({ error: 'no_audio', message: 'No audio received.' });
    const context = String(req.get('X-Flow-Context') || '').trim().slice(0, 120);
    const model = String(req.get('X-Flow-Model') || '').trim() || OLLAMA_MODEL;
    try {
      const raw = await transcribe(buf);
      if (!raw) return res.json({ raw: '', text: '' });
      
      let text = raw;
      try {
        const cleaned = await ollamaChat(model, [
          { role: 'system', content: cleanupSystem({ context }) },
          { role: 'user', content: raw },
        ]);
        if (cleaned) text = cleaned;
      } catch (_) {  }
      res.json({ raw, text });
    } catch (e) {
      res.status((e && e.code) || 500).json({ error: 'local', message: (e && e.msg) || 'Flow failed.' });
    }
  });

  r.post('/command', json, async (req, res) => {
    const selection = String((req.body && req.body.selection) || '');
    const instruction = String((req.body && req.body.instruction) || '').trim();
    if (!instruction) return res.status(400).json({ error: 'no_instruction', message: 'No instruction given.' });
    if (!selection.trim()) return res.status(400).json({ error: 'no_selection', message: 'No text selected.' });
    const model = String(req.get('X-Flow-Model') || '').trim() || OLLAMA_MODEL;
    try {
      const text = await ollamaChat(model, [
        { role: 'system', content: commandSystem() },
        { role: 'user', content: commandUser(selection, instruction) },
      ]);
      res.json({ text });
    } catch (e) {
      res.status((e && e.code) || 500).json({ error: 'local', message: (e && e.msg) || 'Command failed.' });
    }
  });

  return r;
}

module.exports = { router };
