'use strict';

// localhub/node-sidecar/lib/speaker.js — Pi-side text-to-speech.
//
// Pipes text through Piper (local neural TTS, free, runs on ARM) into
// aplay for ALSA playback. Mirrors the web app's "free fallback" voice
// (the equivalent of the browser's SpeechSynthesis) — the equivalent
// of ElevenLabs primary will land in a follow-up that ships the user's
// BYOK key from phone to Pi.
//
// Paths are env-overridable so a developer laptop can point at any
// piper install; the Pi setup script puts everything under /opt/piper.
//
// Concurrency: one playback at a time. A new speak() cancels whatever
// is currently playing — proactive notifications shouldn't pile up.

const { spawn } = require('child_process');

const PIPER_BIN   = process.env.PIPER_BIN   || '/opt/piper/piper';
const PIPER_MODEL = process.env.PIPER_MODEL || '/opt/piper/voices/en_US-lessac-medium.onnx';
const APLAY_BIN   = process.env.APLAY_BIN   || 'aplay';
// ALSA_DEVICE pins -D for aplay (e.g. "plughw:0,0"). Set by setup-audio.sh
// in /etc/cehub/audio.env after it probes the HDMI card. Without this, the
// sidecar (a systemd service with no user shell context) falls through to
// whatever ALSA picks as "default" — often the wrong card.
const ALSA_DEVICE = process.env.ALSA_DEVICE || '';
const PIPER_RATE  = 22050;   // lessac-medium voice native sample rate

let _current = null;   // { piper, aplay } currently-playing pair

function cancel() {
  if (!_current) return;
  try { _current.piper.kill('SIGTERM'); } catch (_) {}
  try { _current.aplay.kill('SIGTERM'); } catch (_) {}
  _current = null;
}

// Speak `text`. Returns a promise that resolves when playback ends (or
// rejects with a tagged error if either subprocess fails to spawn).
// Resolves even on cancel — the speaker is a fire-and-forget tool, not a
// transcript.
function speak(text) {
  return new Promise((resolve, reject) => {
    const clean = String(text || '').trim();
    if (!clean) { resolve({ ok: false, reason: 'empty_text' }); return; }

    cancel();   // one voice at a time

    let piper, aplay;
    try {
      piper = spawn(PIPER_BIN, ['--model', PIPER_MODEL, '--output_raw'], { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) { reject({ error: 'piper_spawn_failed', detail: err.message }); return; }

    try {
      const aplayArgs = ['-r', String(PIPER_RATE), '-f', 'S16_LE', '-t', 'raw'];
      if (ALSA_DEVICE) aplayArgs.push('-D', ALSA_DEVICE);
      aplayArgs.push('-');
      aplay = spawn(APLAY_BIN, aplayArgs, { stdio: ['pipe', 'ignore', 'pipe'] });
    } catch (err) {
      try { piper.kill('SIGTERM'); } catch (_) {}
      reject({ error: 'aplay_spawn_failed', detail: err.message }); return;
    }

    _current = { piper, aplay };

    piper.stdout.pipe(aplay.stdin);

    // Drain stderr so the pipes don't stall; capture last line for diagnostics.
    let piperErr = '';
    let aplayErr = '';
    piper.stderr.on('data', d => { piperErr += d.toString(); });
    aplay.stderr.on('data', d => { aplayErr += d.toString(); });

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (_current && _current.piper === piper) _current = null;
      resolve(result);
    };

    // Feed text in once spawn settled — piper reads to EOF.
    piper.stdin.end(clean + '\n');

    aplay.on('close', (code) => {
      finish({ ok: true, code, chars: clean.length, piper_stderr: piperErr.slice(-200), aplay_stderr: aplayErr.slice(-200) });
    });
    piper.on('error', (err) => finish({ ok: false, error: 'piper_runtime_error', detail: err.message }));
    aplay.on('error', (err) => finish({ ok: false, error: 'aplay_runtime_error', detail: err.message }));
  });
}

module.exports = { speak, cancel };
