const dns = require('node:dns').promises;
const https = require('node:https');
const net = require('node:net');

const PAGE_TIMEOUT_MS = 7000;
const PAGE_MAX_BYTES = 1536 * 1024;
const PAGE_MAX_TEXT = 12000;
const MIN_PAGE_TEXT = 300;

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'been', 'before', 'being', 'between',
  'could', 'does', 'from', 'have', 'into', 'just', 'more', 'most', 'other',
  'over', 'research', 'should', 'some', 'than', 'that', 'their', 'there',
  'these', 'they', 'this', 'through', 'under', 'using', 'want', 'what', 'when',
  'where', 'which', 'while', 'with', 'would', 'your',
]);

function isPublicIPv4(address) {
  const parts = String(address).split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 0 && c === 0) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function isPublicIPv6(address) {
  const value = String(address).toLowerCase().split('%')[0];
  if (value === '::' || value === '::1') return false;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value);
  if (mapped) return isPublicIPv4(mapped[1]);
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(value);
  if (mappedHex) {
    const high = parseInt(mappedHex[1], 16);
    const low = parseInt(mappedHex[2], 16);
    return isPublicIPv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  if (value.startsWith('::')) return false; 
  const first = parseInt(value.split(':')[0] || '0', 16);
  if ((first & 0xe000) !== 0x2000) return false; 
  if ((first & 0xfe00) === 0xfc00) return false; 
  if ((first & 0xffc0) === 0xfe80) return false; 
  if ((first & 0xff00) === 0xff00) return false; 
  const second = parseInt(value.split(':')[1] || '0', 16);
  if (first === 0x2001 && [0, 2, 0x10, 0xdb8].includes(second)) return false;
  if (first === 0x2002) return false; 
  return true;
}

function isPublicAddress(address) {
  const family = net.isIP(String(address));
  if (family === 4) return isPublicIPv4(address);
  if (family === 6) return isPublicIPv6(address);
  return false;
}

function parsePublicHttpsUrl(rawUrl) {
  let url;
  try { url = new URL(String(rawUrl || '')); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  if (url.port && url.port !== '443') return null;
  if (!url.hostname || url.hostname.length > 253) return null;
  const host = url.hostname.toLowerCase();
  const unwrappedHost = host.replace(/^\[|\]$/g, '');
  if (net.isIP(unwrappedHost)) return null;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return null;
  return url;
}

async function resolvePublicAddress(hostname, lookup = dns.lookup) {
  let answers;
  if (net.isIP(hostname)) {
    answers = [{ address: hostname, family: net.isIP(hostname) }];
  } else {
    answers = await lookup(hostname, { all: true, verbatim: true });
  }
  const rows = (Array.isArray(answers) ? answers : [answers])
    .filter(Boolean)
    .map(row => ({ address: String(row.address || ''), family: Number(row.family) || net.isIP(row.address) }));
  if (!rows.length || rows.some(row => !isPublicAddress(row.address))) {
    throw new Error('unsafe_address');
  }
  return rows.find(row => row.family === 4) || rows[0];
}

function requestPinnedPage({ url, address, timeoutMs = PAGE_TIMEOUT_MS, maxBytes = PAGE_MAX_BYTES }) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      protocol: 'https:',
      hostname: url.hostname,
      port: 443,
      path: `${url.pathname || '/'}${url.search || ''}`,
      method: 'GET',
      servername: url.hostname,
      lookup(_hostname, _options, callback) {
        if (_options?.all) callback(null, [address]);
        else callback(null, address.address, address.family);
      },
      headers: {
        'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9',
        'Accept-Encoding': 'identity',
        'User-Agent': 'Tenari-Fetch/1.0 (+https://containedevolution.com)',
      },
    }, response => {
      const declared = Number(response.headers?.['content-length']);
      if (Number.isFinite(declared) && declared > maxBytes) {
        response.resume();
        reject(new Error('response_too_large'));
        return;
      }
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > maxBytes) {
          response.destroy(new Error('response_too_large'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({
        statusCode: response.statusCode || 0,
        headers: response.headers || {},
        body: Buffer.concat(chunks).toString('utf8'),
      }));
      response.on('error', reject);
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('request_timeout')));
    req.on('error', reject);
    req.end();
  });
}

function decodeHtmlEntities(value) {
  const named = { amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"' };
  return String(value || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (full, entity) => {
    if (entity[0] === '#') {
      const hex = entity[1].toLowerCase() === 'x';
      const point = parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : ' ';
    }
    return named[entity.toLowerCase()] ?? ' ';
  });
}

function extractReadableText(html, maxText = PAGE_MAX_TEXT) {
  let source = String(html || '');
  const focused = source.match(/<(article|main)\b[^>]*>([\s\S]*?)<\/\1>/i);
  if (focused && focused[2].replace(/<[^>]+>/g, ' ').length >= MIN_PAGE_TEXT) source = focused[2];
  source = source
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg|form)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/section|\/article|\/tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeHtmlEntities(source)
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxText);
}

async function readPublicPage(rawUrl, deps = {}) {
  const url = parsePublicHttpsUrl(rawUrl);
  if (!url) return { ok: false, reason: 'unsafe_url', text: '' };
  try {
    const address = await resolvePublicAddress(url.hostname, deps.lookup || dns.lookup);
    const response = await (deps.request || requestPinnedPage)({
      url,
      address,
      timeoutMs: deps.timeoutMs || PAGE_TIMEOUT_MS,
      maxBytes: deps.maxBytes || PAGE_MAX_BYTES,
    });
    const status = Number(response?.statusCode) || 0;
    if (status < 200 || status >= 300) {
      return { ok: false, reason: status >= 300 && status < 400 ? 'redirect_rejected' : 'http_error', text: '' };
    }
    const contentType = String(response?.headers?.['content-type'] || '').toLowerCase();
    if (!/^(text\/html|application\/xhtml\+xml|text\/plain)(?:;|$)/.test(contentType)) {
      return { ok: false, reason: 'unsupported_content_type', text: '' };
    }
    const contentEncoding = String(response?.headers?.['content-encoding'] || 'identity').toLowerCase();
    if (contentEncoding !== 'identity') {
      return { ok: false, reason: 'unsupported_encoding', text: '' };
    }
    const declared = Number(response?.headers?.['content-length']);
    if (Number.isFinite(declared) && declared > (deps.maxBytes || PAGE_MAX_BYTES)) {
      return { ok: false, reason: 'response_too_large', text: '' };
    }
    const text = contentType.startsWith('text/plain')
      ? String(response.body || '').replace(/\s+/g, ' ').trim().slice(0, PAGE_MAX_TEXT)
      : extractReadableText(response.body);
    if (text.length < MIN_PAGE_TEXT) return { ok: false, reason: 'insufficient_text', text: '' };
    return { ok: true, reason: 'page', text };
  } catch (error) {
    return { ok: false, reason: String(error?.message || 'read_failed').slice(0, 80), text: '' };
  }
}

async function enrichSearchResults(results, reader = readPublicPage) {
  return Promise.all((Array.isArray(results) ? results : []).map(async result => {
    const fallback = String(result?.extract || result?.title || '').trim().slice(0, 1200);
    const page = result?.url ? await reader(result.url) : { ok: false, reason: 'missing_url', text: '' };
    return {
      ...result,
      extract: page.ok ? page.text : fallback,
      evidence_kind: page.ok ? 'page' : 'search-snippet',
      read_status: page.reason,
    };
  }));
}

function evidenceTerms(query, tags = []) {
  const text = [query, ...(Array.isArray(tags) ? tags : []).map(tag => String(tag).replace(/^(category|topic|entity)\//, ' '))]
    .join(' ')
    .toLowerCase();
  return [...new Set(text.match(/[a-z0-9]+/g) || [])]
    .filter(term => term.length > 2 && !STOP_WORDS.has(term))
    .slice(0, 24);
}

function rankStoredEvidence(rows, { query = '', tags = [], limit = 10 } = {}) {
  const terms = evidenceTerms(query, tags);
  if (!terms.length) return [];
  const seen = new Set();
  return (Array.isArray(rows) ? rows : [])
    .map(row => {
      const haystack = `${row?.content || ''} ${(row?.tags || []).join(' ')}`.toLowerCase();
      const haystackTerms = new Set(haystack.match(/[a-z0-9]+/g) || []);
      const score = terms.reduce((sum, term) => sum + (haystackTerms.has(term) ? 1 : 0), 0);
      return { row, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => (b.score - a.score)
      || String(b.row?.created_at || '').localeCompare(String(a.row?.created_at || '')))
    .filter(item => {
      const key = item.row?.source_url
        ? `url:${String(item.row.source_url).toLowerCase()}`
        : `text:${String(item.row?.content || '').toLowerCase().replace(/\s+/g, ' ').slice(0, 240)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, Math.max(1, Math.min(20, Number(limit) || 10)))
    .map(item => item.row);
}

function mergeEvidence(primary, secondary, limit = 16) {
  const seen = new Set();
  const out = [];
  for (const row of [...(primary || []), ...(secondary || [])]) {
    const key = row?.source_url
      ? `url:${String(row.source_url).toLowerCase()}`
      : `text:${String(row?.content || '').toLowerCase().replace(/\s+/g, ' ').slice(0, 240)}`;
    if (!key.endsWith(':') && !seen.has(key)) {
      seen.add(key);
      out.push(row);
    }
    if (out.length >= limit) break;
  }
  return out;
}

module.exports = {
  PAGE_MAX_BYTES,
  isPublicAddress,
  parsePublicHttpsUrl,
  resolvePublicAddress,
  extractReadableText,
  readPublicPage,
  enrichSearchResults,
  evidenceTerms,
  rankStoredEvidence,
  mergeEvidence,
};
