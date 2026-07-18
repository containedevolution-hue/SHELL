'use strict';

// localhub/node-sidecar/lib/speaker.js — Pi-side text-to-speech.
//
// Two engines, ElevenLabs preferred, Piper the always-available local
// fallback:
//   - ElevenLabs: fetch MP3 -> ffmpeg decode to raw PCM -> aplay. Only
//     tried when data/elevenlabs.json (gitignored, this box only) holds a
//     key + voiceId. Any failure (network, bad key, ffmpeg missing) falls
//     back to Piper rather than going silent.
//   - Piper (local neural TTS, free, runs on ARM): text -> aplay for ALSA
//     playback. Mirrors the web app's browser-SpeechSynthesis fallback.
//
// Paths are env-overridable so a developer laptop can point at any local
// install; the Pi setup script puts Piper under /opt/piper.
//
// Concurrency: one playback at a time. A new speak() cancels whatever
// is currently playing — proactive notifications shouldn't pile up.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PIPER_BIN   = process.env.PIPER_BIN   || '/opt/piper/piper';
const PIPER_MODEL = process.env.PIPER_MODEL || '/opt/piper/voices/en_US-lessac-medium.onnx';
const APLAY_BIN   = process.env.APLAY_BIN   || 'aplay';
const FFMPEG_BIN  = process.env.FFMPEG_BIN  || 'ffmpeg';
// ALSA_DEVICE pins -D for aplay (e.g. "plughw:0,0"). Set by setup-audio.sh
// in /etc/cehub/audio.env after it probes the HDMI card. Without this, the
// sidecar (a systemd service with no user shell context) falls through to
// whatever ALSA picks as "default" — often the wrong card.
const ALSA_DEVICE = process.env.ALSA_DEVICE || '';
const PIPER_RATE  = 22050;   // lessac-medium voice native sample rate

const KEY_FILE = process.env.ELEVENLABS_KEY_FILE || path.join(__dirname, '..', 'data', 'elevenlabs.json');

function elevenLabsConfig() {
  try {
    const d = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
    if (d && d.apiKey && d.voiceId) return d;
  } catch (_) {}
  return null;
}

let _current = null;   // { procs: [...] } currently-playing pipeline

function cancel() {
  if (!_current) return;
  for (const p of _current.procs) { try { p.kill('SIGTERM'); } catch (_) {} }
  _current = null;
}

function runAplay(rate) {
  const args = ['-r', String(rate), '-f', 'S16_LE', '-t', 'raw'];
  if (ALSA_DEVICE) args.push('-D', ALSA_DEVICE);
  args.push('-');
  return spawn(APLAY_BIN, args, { stdio: ['pipe', 'ignore', 'pipe'] });
}

// ElevenLabs: MP3 buffer -> ffmpeg (decode to raw PCM) -> aplay.
function speakElevenLabs(text, cfg) {
  return new Promise((resolve, reject) => {
    const url = 'https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(cfg.voiceId);
    fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': cfg.apiKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: 'eleven_turbo_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    }).then(async (res) => {
      if (!res.ok) { reject({ error: 'elevenlabs_http_' + res.status }); return; }
      const mp3 = Buffer.from(await res.arrayBuffer());

      let ffmpeg, aplay;
      try {
        ffmpeg = spawn(FFMPEG_BIN, ['-i', 'pipe:0', '-f', 's16le', '-ar', String(PIPER_RATE), '-ac', '1', 'pipe:1'],
          { stdio: ['pipe', 'pipe', 'pipe'] });
      } catch (err) { reject({ error: 'ffmpeg_spawn_failed', detail: err.message }); return; }
      try { aplay = runAplay(PIPER_RATE); }
      catch (err) { try { ffmpeg.kill('SIGTERM'); } catch (_) {} reject({ error: 'aplay_spawn_failed', detail: err.message }); return; }

      _current = { procs: [ffmpeg, aplay] };
      ffmpeg.stdout.pipe(aplay.stdin);
      let ffErr = '', aplayErr = '';
      ffmpeg.stderr.on('data', d => { ffErr += d.toString(); });
      aplay.stderr.on('data', d => { aplayErr += d.toString(); });

      let settled = false;
      const finish = (result, isError) => {
        if (settled) return;
        settled = true;
        if (_current && _current.procs.includes(ffmpeg)) _current = null;
        if (isError) reject(result); else resolve(result);
      };
      ffmpeg.stdin.end(mp3);
      aplay.on('close', (code) => finish({ ok: true, code, chars: text.length, engine: 'elevenlabs', ff_stderr: ffErr.slice(-200), aplay_stderr: aplayErr.slice(-200) }));
      ffmpeg.on('error', (err) => finish({ error: 'ffmpeg_runtime_error', detail: err.message }, true));
      aplay.on('error', (err) => finish({ error: 'aplay_runtime_error', detail: err.message }, true));
    }).catch((err) => reject({ error: 'elevenlabs_fetch_failed', detail: err.message }));
  });
}

// Piper: text -> aplay for ALSA playback. Always available, no network.
function speakPiper(text) {
  return new Promise((resolve, reject) => {
    let piper, aplay;
    try {
      piper = spawn(PIPER_BIN, ['--model', PIPER_MODEL, '--output_raw'], { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) { reject({ error: 'piper_spawn_failed', detail: err.message }); return; }
    try { aplay = runAplay(PIPER_RATE); }
    catch (err) { try { piper.kill('SIGTERM'); } catch (_) {} reject({ error: 'aplay_spawn_failed', detail: err.message }); return; }

    _current = { procs: [piper, aplay] };
    piper.stdout.pipe(aplay.stdin);
    let piperErr = '', aplayErr = '';
    piper.stderr.on('data', d => { piperErr += d.toString(); });
    aplay.stderr.on('data', d => { aplayErr += d.toString(); });

    let settled = false;
    const finish = (result, isError) => {
      if (settled) return;
      settled = true;
      if (_current && _current.procs.includes(piper)) _current = null;
      if (isError) reject(result); else resolve(result);
    };
    piper.stdin.end(text + '\n');
    aplay.on('close', (code) => finish({ ok: true, code, chars: text.length, engine: 'piper', piper_stderr: piperErr.slice(-200), aplay_stderr: aplayErr.slice(-200) }));
    piper.on('error', (err) => finish({ error: 'piper_runtime_error', detail: err.message }, true));
    aplay.on('error', (err) => finish({ error: 'aplay_runtime_error', detail: err.message }, true));
  });
}

// Speak `text`. Tries ElevenLabs first when configured, falls back to Piper
// on ANY failure (bad key, network down, ffmpeg missing) rather than going
// silent. Returns a promise that resolves when playback ends. Resolves even
// on cancel — the speaker is fire-and-forget, not a transcript.
async function speak(text) {
  const clean = String(text || '').trim();
  if (!clean) return { ok: false, reason: 'empty_text' };

  cancel();   // one voice at a time

  const cfg = elevenLabsConfig();
  if (cfg) {
    try { return await speakElevenLabs(clean, cfg); }
    catch (err) { /* fall through to Piper below */ }
  }
  try { return await speakPiper(clean); }
  catch (err) { return { ok: false, ...err }; }
}

module.exports = { speak, cancel };
