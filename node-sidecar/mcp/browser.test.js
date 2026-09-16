'use strict';

const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-browser-data-'));
process.env.LOCALHUB_DATA_DIR = dataDir;

const browser = require('./browser');
const status = require('./tools/browser-status');
const tabs = require('./tools/browser-tabs');
const open = require('./tools/browser-open');
const readPage = require('./tools/browser-read-page');

let failures = 0;
const pending = [];
function check(name, fn) { pending.push([name, fn]); }

let opened = [];
function fakeChrome() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      res.setHeader('content-type', 'application/json');
      if (url.pathname === '/json/version') return res.end(JSON.stringify({ Browser: 'Chrome/Fake' }));
      if (url.pathname === '/json/list') {
        return res.end(JSON.stringify([
          { type: 'page', id: 'a', title: 'Approved page', url: 'https://example.com/docs', webSocketDebuggerUrl: 'ws://127.0.0.1:1/a' },
          { type: 'page', id: 'b', title: 'Private banking', url: 'https://mybank.example.net/accounts', webSocketDebuggerUrl: 'ws://127.0.0.1:1/b' },
          { type: 'service_worker', id: 'c', title: 'sw', url: 'https://example.com/sw.js' },
        ]));
      }
      if (url.pathname === '/json/new') {
        const target = decodeURIComponent(url.search.slice(1));
        opened.push(target);
        return res.end(JSON.stringify({ id: 'new', title: 'Opened', url: target }));
      }
      res.statusCode = 404;
      res.end('{}');
    });
    server.listen(0, '127.0.0.1', () => {
      process.env.MCP_BROWSER_PORT = String(server.address().port);
      resolve(server);
    });
  });
}

check('everything is denied before the user approves a website', async () => {
  browser.saveDomains([]);
  assert.strictEqual(browser.isAllowed('https://example.com/'), false);
  assert.throws(() => browser.requireAllowed('https://example.com/'), /no websites are approved/);
});

check('approval covers subdomains but not lookalike domains', async () => {
  browser.saveDomains(['example.com']);
  assert.strictEqual(browser.isAllowed('https://example.com/x'), true, 'exact host');
  assert.strictEqual(browser.isAllowed('https://docs.example.com/x'), true, 'subdomain');
  assert.strictEqual(browser.isAllowed('https://notexample.com/x'), false, 'suffix lookalike denied');
  assert.strictEqual(browser.isAllowed('https://example.com.evil.net/x'), false, 'prefix lookalike denied');
  browser.saveDomains([]);
});

check('non-web schemes are refused even on an approved domain', async () => {
  browser.saveDomains(['example.com']);
  assert.throws(() => browser.requireAllowed('file://example.com/etc/passwd'), /only http and https/);
  assert.throws(() => browser.requireAllowed('javascript:alert(1)'), /only http and https/);
  browser.saveDomains([]);
});

check('status is honest when no browser is reachable', async () => {
  process.env.MCP_BROWSER_PORT = '1';
  browser.saveDomains([]);
  const res = await status.execute();
  assert.strictEqual(res.reachable, false, 'reports unreachable');
  assert.strictEqual(res.usable, false, 'reports unusable');
  assert.ok(/remote-debugging-port/.test(res.detail), 'explains what the user must do');
  assert.ok(/never launches/.test(res.detail), 'states Tenari will not start the browser itself');
});

check('status reports reachable but unusable with no approved website', async () => {
  const server = await fakeChrome();
  browser.saveDomains([]);
  const res = await status.execute();
  assert.strictEqual(res.reachable, true);
  assert.strictEqual(res.usable, false, 'reachable is not enough');
  assert.ok(/no websites are approved/.test(res.detail));
  server.close();
});

check('tabs shows approved pages and only counts the rest', async () => {
  const server = await fakeChrome();
  browser.saveDomains(['example.com']);
  const res = await tabs.execute();
  assert.strictEqual(res.count, 1, 'one approved page');
  assert.strictEqual(res.tabs[0].url, 'https://example.com/docs');
  assert.strictEqual(res.hidden_unapproved_tabs, 1, 'the bank tab is counted');
  assert.ok(!JSON.stringify(res).includes('mybank'), 'unapproved tab never named');
  assert.ok(!JSON.stringify(res).includes('sw.js'), 'non-page targets excluded');
  browser.saveDomains([]);
  server.close();
});

check('open refuses an unapproved website and opens an approved one', async () => {
  const server = await fakeChrome();
  browser.saveDomains(['example.com']);
  opened = [];

  const denied = await open.execute({ url: 'https://mybank.example.net/transfer' });
  assert.ok(denied.error, 'refused');
  assert.strictEqual(opened.length, 0, 'nothing was opened');

  const allowed = await open.execute({ url: 'https://example.com/hello' });
  assert.strictEqual(allowed.error, undefined, 'opened without error');
  assert.deepStrictEqual(opened, ['https://example.com/hello']);

  browser.saveDomains([]);
  server.close();
});

check('reading refuses a tab on an unapproved website', async () => {
  const server = await fakeChrome();
  browser.saveDomains(['example.com']);
  const res = await readPage.execute({ url: 'https://mybank.example.net/accounts' });
  assert.ok(res.error, 'refused');
  assert.ok(!/innerText/.test(String(res.error)), 'no leaked internals');
  browser.saveDomains([]);
  server.close();
});

check('reading refuses when no approved tab matches', async () => {
  const server = await fakeChrome();
  browser.saveDomains(['example.com']);
  const res = await readPage.execute({ url: 'https://example.com/not-open' });
  assert.ok(res.error, 'refused');
  assert.ok(/browser_tabs/.test(res.error), 'points at the discovery tool');
  browser.saveDomains([]);
  server.close();
});

(async () => {
  for (const [name, fn] of pending) {
    try { await fn(); console.log('  ok   -', name); }
    catch (e) { failures++; console.error('  FAIL -', name, '\n         ', e.stack || e.message); }
  }
  delete process.env.MCP_BROWSER_PORT;
  delete process.env.LOCALHUB_DATA_DIR;
  if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
  console.log('\nall browser checks passed');
})();
