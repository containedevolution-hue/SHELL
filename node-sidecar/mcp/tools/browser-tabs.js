'use strict';

const browser = require('../browser');
const audit = require('../audit');

module.exports = {
  name: 'browser_tabs',
  definition: {
    type: 'function',
    function: {
      name: 'browser_tabs',
      description:
        'List the browser tabs the user has approved you to see, with their title and address. ' +
        'Tabs on websites the user has not approved are counted but never named or described.',
      parameters: { type: 'object', properties: {} },
    },
  },
  async execute() {
    let pages;
    try {
      pages = await browser.targets();
    } catch (err) {
      if (err instanceof browser.BrowserError) return { error: err.message };
      throw err;
    }
    const visible = [];
    let hidden = 0;
    for (const page of pages) {
      if (browser.isAllowed(page.url)) visible.push({ title: page.title || '(untitled)', url: page.url });
      else hidden++;
    }
    audit.record({ tool: 'browser_tabs', visible: visible.length, hidden });
    return {
      count: visible.length,
      hidden_unapproved_tabs: hidden,
      tabs: visible,
      approved_websites: browser.domains(),
    };
  },
};
