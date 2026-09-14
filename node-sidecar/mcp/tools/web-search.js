'use strict';

const MAX_QUERY = 500;
const MAX_RESULTS = 20;

function cleanText(value, limit) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, limit);
}

function publicHttpsUrl(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.href;
  } catch (_) { return null; }
}

function normalizeSerper(body, limit) {
  const rows = Array.isArray(body && body.organic) ? body.organic : [];
  return rows.slice(0, limit).map((row) => {
    const url = publicHttpsUrl(row.link);
    if (!url) return null;
    return {
      title: cleanText(row.title, 300) || new URL(url).hostname,
      url,
      snippet: cleanText(row.snippet, 1200),
      source: new URL(url).hostname.replace(/^www\./, ''),
    };
  }).filter(Boolean);
}

async function searchSerper(query, limit, fetchImpl = fetch) {
  const key = process.env.SERPER_API_KEY;
  if (!key) return { error: 'web search is not configured on this server' };
  const response = await fetchImpl('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
    body: JSON.stringify({ q: query, num: limit }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) return { error: `search provider returned ${response.status}` };
  const body = await response.json();
  return { provider: 'Serper', query, results: normalizeSerper(body, limit) };
}

module.exports = {
  name: 'web_search',
  definition: {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the public web through the provider configured by the owner of this home server. Returns HTTPS links and short snippets.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query.' },
          limit: { type: 'integer', minimum: 1, maximum: MAX_RESULTS, description: 'Maximum result count. Defaults to 10.' },
        },
        required: ['query'],
      },
    },
  },
  async execute({ query, limit } = {}) {
    const cleaned = cleanText(query, MAX_QUERY);
    if (!cleaned) return { error: 'query must be a non-empty string' };
    const wanted = Number.isSafeInteger(limit) ? Math.max(1, Math.min(MAX_RESULTS, limit)) : 10;
    return searchSerper(cleaned, wanted);
  },
  cleanText,
  publicHttpsUrl,
  normalizeSerper,
  searchSerper,
};
