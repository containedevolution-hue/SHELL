'use strict';

const browser = require('../browser');
const audit = require('../audit');

module.exports = {
  name: 'browser_open',
  definition: {
    type: 'function',
    function: {
      name: 'browser_open',
      description:
        'Open a web address in a new tab of the user\'s browser. ' +
        'Only websites the user has approved can be opened, and only http or https addresses. ' +
        'This opens a page for the user to see; it does not click, type, or submit anything.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Full http or https address on an approved website.' },
        },
        required: ['url'],
      },
    },
  },
  async execute({ url } = {}) {
    if (typeof url !== 'string' || url.length === 0) return { error: 'url must be a non-empty string' };
    try {
      const tab = await browser.openTab(url);
      audit.record({ tool: 'browser_open', url });
      return { opened: true, url: tab.url || url, title: tab.title || null };
    } catch (err) {
      if (err instanceof browser.BrowserError) return { error: err.message };
      throw err;
    }
  },
};
