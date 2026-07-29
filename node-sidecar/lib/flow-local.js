// localhub/node-sidecar/lib/flow-local.js — Flow's NO-API (fully local) engine.
//
// The offline twin of routes/flow.js. Where the cloud path relays to Groq
// (STT + cleanup on the user's key), this path spends nothing and needs no key:
//   - STT  = whisper.cpp, spawned as a child process on a bundled ggml model.
//   - LLM  = a local Ollama server (http://127.0.0.1:11434), same prompts.
// It lives in the LocalHub sidecar because a browser can't run whisper itself —
// one HTTP engine on the hub serves every client (desktop HUD over loopback,
// the Tauri PWA over loopback, LAN phones over hub_lan_url).
//
// Routes (mounted at /flow in index.js, before the PouchDB catch-all):
//   GET  /flow/health   — { whisper, ollama, model, ollamaModel } readiness for
//                         the client's Cloud/Local toggle.
//   POST /flow/dictate  — raw 16kHz-mono WAV bytes in → { raw, text }. whisper
//                         transcribes (raw), Ollama cleans (text). Empty clip →
//                         skip the LLM (mirrors routes/flow.js).
//   POST /flow/command  — { selection, instruction } → { text } via Ollama.
//   POST /flow/model    — one-time download of the ggml model into the model dir
//                         (idempotent). After this the engine is fully offline.
//
// Env (set by Tauri spawn_sidecar in src-tauri/src/main.rs):
//   WHISPER_BIN        — path to the whisper.cpp CLI (whisper-cli / main).
//   WHISPER_MODEL_DIR  — dir holding ggml-*.bin (default: data/whisper).
//   WHISPER_MODEL      — model filename (default ggml-base.en.bin).
//   OLLAMA_BASE        — override Ollama origin (default http://127.0.0.1:11434).
//
// Notes / connections:
//   - Prompts reused verbatim from lib/flow-prompts.js (single source; same
//     prompts the cloud relay uses). Client override via X-Flow-Model header.
//   - No auth on these routes: they only ever bind loopback (laptop/Tauri) or a
//     single-tenant LAN device (Pi, LOCALHUB_HOST=0.0.0.0) — same trust model as
//     the PouchDB endpoint on the same app. Never spends a CE token.

'use strict';

const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { Readable } = require('stream');

// Single prompt source — the same file routes/flow.js uses (repo lib/).
const { cleanupSystem, commandSystem, commandUser } = require('../../../lib/flow-prompts');

const OLLAMA_BASE   = process.env.OLLAMA_BASE || 'http://127.0.0.1:11434';
const OLLAMA_MODEL  = process.env.OLLAMA_MODEL || 'llama3.2';
const MODEL_NAME    = process.env.WHISPER_MODEL || 'ggml-base.en.bin';
// HuggingFace mirror for the ggml model (public, no login/fee) — one-time fetch.
const MODEL_URL     = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/' + MODEL_NAME;
const STT_TIMEOUT   = 60000;   // local transcription of a short clip
const LLM_TIMEOUT   = 60000;

// Resolve the model dir lazily so `dataDir` (from index.js) is honored without a
// hard import cycle. Falls back to a whisper/ subfolder beside this script's data.
function modelDir() {
  return process.env.WHISPER_MODEL_DIR || require('./paths').inData('whisper');
}
function modelPath() { return path.join(modelDir(), MODEL_NAME); }
// Falls back to a binary sitting beside the model (same locality as modelDir's
// own default) so a box that built whisper.cpp locally works without needing
// its systemd unit edited just to set one env var.
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

// ── whisper.cpp ──────────────────────────────────────────────────────────────
// Write the WAV to a temp file, run the CLI with -otxt, read the sidecar .txt.
// whisper.cpp needs 16kHz mono PCM WAV — the client captures exactly that for
// the local path (public/js/flow.js startRecordingWav), so no transcode here.
function transcribe(wavBuffer) {
  return new Promise((resolve, reject) => {
    const bin = whisperBin();
    if (!bin) return reject({ code: 503, msg: 'whisper not configured on this host.' });
    if (!fs.existsSync(modelPath())) return reject({ code: 503, msg: 'whisper model not downloaded yet.' });

    const stamp = crypto.randomBytes(6).toString('hex');
    const base  = path.join(os.tmpdir(), 'ce-flow-' + stamp);
    const wav   = base + '.wav';
    const txt   = base + '.txt';   // whisper writes <of>.txt with -otxt
    try { fs.writeFileSync(wav, wavBuffer); } catch (e) { return reject({ code: 500, msg: 'temp write failed.' }); }

    const cleanup = () => { for (const f of [wav, txt]) { try { fs.unlinkSync(f); } catch (_) {} } };

    // -nt no timestamps, -otxt write plain text, -of output prefix, -np no prints.
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

// ── Ollama chat ──────────────────────────────────────────────────────────────
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

// ── model download (one-time, idempotent) ────────────────────────────────────
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

// ── router ───────────────────────────────────────────────────────────────────
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

  // POST /flow/dictate — WAV → { raw, text }
  r.post('/dictate', rawAudio, async (req, res) => {
    const buf = Buffer.isBuffer(req.body) ? req.body : null;
    if (!buf || !buf.length) return res.status(400).json({ error: 'no_audio', message: 'No audio received.' });
    const context = String(req.get('X-Flow-Context') || '').trim().slice(0, 120);
    const model = String(req.get('X-Flow-Model') || '').trim() || OLLAMA_MODEL;
    try {
      const raw = await transcribe(buf);
      if (!raw) return res.json({ raw: '', text: '' });
      // whisper succeeding shouldn't be held hostage by Ollama being down/unset
      // (e.g. a box that only wants raw STT, no cleanup model installed) — fall
      // back to the raw transcript instead of erroring the whole request.
      let text = raw;
      try {
        const cleaned = await ollamaChat(model, [
          { role: 'system', content: cleanupSystem({ context }) },
          { role: 'user', content: raw },
        ]);
        if (cleaned) text = cleaned;
      } catch (_) { /* Ollama unavailable — raw stands */ }
      res.json({ raw, text });
    } catch (e) {
      res.status((e && e.code) || 500).json({ error: 'local', message: (e && e.msg) || 'Flow failed.' });
    }
  });

  // POST /flow/command — { selection, instruction } → { text }
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
