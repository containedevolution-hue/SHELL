'use strict';

// Pi appliance MCP tool — speak(text).
//
// Plays `text` aloud through the Pi's audio output (the 52Pi screen's
// built-in speakers when the Hub Display kiosk is the active sink, or
// the HDMI/headphone jack the user has configured). Local Piper TTS is
// the engine today; an ElevenLabs path will land once the user's BYOK
// key is shipped from phone to Pi at pairing.
//
// PA-side: discovered automatically by lib/appliance-mcp.js. From the
// user's perspective, asking the PA "have the hub say hello" should
// surface this tool.

const speaker = require('../../lib/speaker');

const MAX_CHARS = 600;   // ~30s of speech; longer = pass it to follow-ups

module.exports = {
  name: 'speak',
  definition: {
    type: 'function',
    function: {
      name: 'speak',
      description:
        'Speak text aloud through the CE Hub appliance speakers. Use when the user asks the Hub itself to say something, or when a proactive notification (alarm, alert, brief) should be voiced in the room. Cancels any in-progress speech so calls do not pile up. Local TTS today; sounds robotic but clear. Keep utterances under 600 characters.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The exact text to speak aloud. Plain text only.' },
        },
        required: ['text'],
      },
    },
  },
  async execute(args) {
    const text = String(args?.text || '').trim();
    if (!text) return { ok: false, error: 'text_required' };
    if (text.length > MAX_CHARS) return { ok: false, error: 'text_too_long', max: MAX_CHARS, got: text.length };
    // Fire-and-forget — return as soon as playback starts so the PA tool-
    // loop doesn't block on the whole utterance. The speaker module
    // resolves when playback ends, but the MCP caller doesn't need that.
    speaker.speak(text).catch(() => {});
    return { ok: true, spoken_chars: text.length };
  },
};
