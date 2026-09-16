'use strict';

const browser = require('../browser');
const audit = require('../audit');

module.exports = {
  name: 'browser_status',
  definition: {
    type: 'function',
    function: {
      name: 'browser_status',
      description:
        'Report whether the user\'s Chrome is reachable for browsing and which websites they have approved. ' +
        'Call this before any other browser tool so you never claim a browsing ability that is unavailable.',
      parameters: { type: 'object', properties: {} },
    },
  },
  async execute() {
    const approved = browser.domains();
    let reachable = false;
    let product = null;
    let tabs = null;
    let detail = null;
    try {
      const info = await browser.version();
      reachable = true;
      product = info.Browser || null;
      tabs = (await browser.targets()).length;
    } catch (err) {
      if (!(err instanceof browser.BrowserError)) throw err;
      detail = err.message;
    }
    audit.record({ tool: 'browser_status', reachable, approved: approved.length });
    return {
      reachable,
      browser: product,
      open_tabs: tabs,
      debug_port: browser.port(),
      approved_websites: approved,
      usable: reachable && approved.length > 0,
      detail: detail || (approved.length === 0
        ? 'Chrome is reachable but no websites are approved yet — ask the user to approve one in Settings.'
        : null),
    };
  },
};
