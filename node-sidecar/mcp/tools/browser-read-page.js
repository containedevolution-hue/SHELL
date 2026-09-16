'use strict';

const browser = require('../browser');
const audit = require('../audit');

const MAX_CHARS = 40000;

module.exports = {
  name: 'browser_read_page',
  definition: {
    type: 'function',
    function: {
      name: 'browser_read_page',
      description:
        'Read the visible text of an open tab on a website the user has approved. ' +
        'Use browser_tabs first to get the exact address. ' +
        'Returns the page text only — no passwords, form values, cookies, or hidden fields.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Address of the open tab to read, as shown by browser_tabs.' },
        },
        required: ['url'],
      },
    },
  },
  async execute({ url } = {}) {
    if (typeof url !== 'string' || url.length === 0) return { error: 'url must be a non-empty string' };
    try {
      const target = await browser.findTarget(url);
      const text = await browser.evaluate(target, 'document.body ? document.body.innerText : ""');
      const body = String(text == null ? '' : text);
      const truncated = body.length > MAX_CHARS;
      audit.record({ tool: 'browser_read_page', url: target.url, chars: body.length });
      return {
        url: target.url,
        title: target.title || null,
        truncated,
        text: truncated ? body.slice(0, MAX_CHARS) : body,
      };
    } catch (err) {
      if (err instanceof browser.BrowserError) return { error: err.message };
      throw err;
    }
  },
};
