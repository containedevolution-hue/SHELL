'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'web/apps.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'web/index.html'), 'utf8');

function pageElements() {
  const elements = new Map();
  for (const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    elements.set(match[1], {
      hidden: /\bhidden\b/.test(match[0]), disabled: false, innerHTML: '', textContent: '',
      setAttribute(name, value) { this[name] = value; },
    });
  }
  return elements;
}

for (const native of [false, true]) {
  test(`${native ? 'native' : 'browser'} catalog retry recovers a failed collection without losing installed apps`, async () => {
    const elements = pageElements();
    const opened = [];
    const requests = [];
    const openButton = { dataset: { open: '/v1/apps/notes/web/index.html' } };
    const notes = { id: 'notes', name: 'Notes', version: '0.1.0', launchUrl: openButton.dataset.open };
    let catalogAttempts = 0;
    let finishRetry;
    const pendingRetry = new Promise(resolve => { finishRetry = resolve; });
    const context = {
      document: {
        getElementById: id => elements.get(id),
        querySelectorAll: selector => selector === '[data-open]' ? [openButton] : [],
      },
      window: native ? { __TAURI__: { core: { invoke() { throw new Error('No mutation is needed for catalog recovery'); } } } } : {},
      location: { protocol: 'http:', hostname: '127.0.0.1', origin: 'http://127.0.0.1:6199', assign: url => opened.push(url) },
      fetch: async (url, options) => {
        const pathname = new URL(url).pathname;
        requests.push({ pathname, method: options && options.method || 'GET' });
        let result;
        if (pathname === '/v1/apps') result = { apps: [notes] };
        else if (pathname === '/v1/pairing-management') result = { paired: false, credentials: {} };
        else if (pathname === '/v1/app-store') {
          catalogAttempts += 1;
          if (catalogAttempts === 1) throw new Error('Temporary service failure');
          await pendingRetry;
          result = { apps: [{ id: 'canvas', name: 'Canvas', description: 'Draw ideas', version: '0.1.0' }], installToken: 'test-token' };
        } else throw new Error(`Unexpected request: ${pathname}`);
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => result };
      },
      setTimeout,
    };
    vm.runInNewContext(source, context);
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(elements.get('state').textContent, '1 installed app');
    assert.equal(elements.get('retry-local').hidden, true);
    assert.equal(elements.get('retry-catalog').hidden, false);
    assert.equal(elements.get('retry-catalog').disabled, false);
    assert.equal(elements.get('catalog-status').hidden, false);
    assert.match(elements.get('catalog-status').textContent, /could not load/);
    const installedMarkup = elements.get('mine').innerHTML;
    assert.match(installedMarkup, /Open Notes/);
    openButton.onclick();
    assert.equal(opened[0], `${native ? 'http://127.0.0.1:5984' : context.location.origin}${notes.launchUrl}`);

    elements.get('store-tab').onclick();
    assert.equal(elements.get('store').hidden, false);
    const beforeRetry = requests.length;
    const retry = elements.get('retry-catalog').onclick();
    assert.equal(elements.get('retry-catalog').disabled, true);
    assert.match(elements.get('catalog-status').textContent, /Loading/);
    finishRetry();
    await retry;

    assert.deepEqual(requests.slice(beforeRetry), [{ pathname: '/v1/app-store', method: 'GET' }]);
    assert.equal(catalogAttempts, 2);
    assert.equal(elements.get('retry-catalog').hidden, true);
    assert.equal(elements.get('retry-catalog').disabled, false);
    assert.equal(elements.get('catalog-status').hidden, true);
    assert.match(elements.get('catalog').innerHTML, /Install Canvas/);
    assert.equal(elements.get('mine').innerHTML, installedMarkup);
    assert.equal(elements.get('state').textContent, '1 installed app');
    assert.ok(requests.every(request => request.method === 'GET'));
  });
}
