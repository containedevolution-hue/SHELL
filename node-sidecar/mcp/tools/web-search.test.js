'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const search = require('./web-search');

test('web search normalizes bounded public HTTPS results', () => {
  const rows = search.normalizeSerper({ organic: [
    { title: '  Useful   result ', link: 'https://example.com/path', snippet: ' A  short   summary. ' },
    { title: 'Blocked', link: 'http://example.com/plain' },
    { title: 'Credentials', link: 'https://name:secret@example.com/' },
  ] }, 10);
  assert.deepEqual(rows, [{ title: 'Useful result', url: 'https://example.com/path', snippet: 'A short summary.', source: 'example.com' }]);
});

test('web search refuses empty input before contacting a provider', async () => {
  assert.deepEqual(await search.execute({ query: '   ' }), { error: 'query must be a non-empty string' });
});

test('web search reports missing server configuration plainly', async () => {
  const previous = process.env.SERPER_API_KEY;
  delete process.env.SERPER_API_KEY;
  try { assert.deepEqual(await search.execute({ query: 'contained evolution' }), { error: 'web search is not configured on this server' }); }
  finally { if (previous == null) delete process.env.SERPER_API_KEY; else process.env.SERPER_API_KEY = previous; }
});
