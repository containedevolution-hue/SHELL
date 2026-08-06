'use strict';

const speaker = require('../../lib/speaker');

const MAX_CHARS = 600;   

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
    
    speaker.speak(text).catch(() => {});
    return { ok: true, spoken_chars: text.length };
  },
};
