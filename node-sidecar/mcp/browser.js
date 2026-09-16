'use strict';

const fs = require('fs');
const { inData } = require('../lib/paths');

const DEFAULT_PORT = 9222;
const CONNECT_TIMEOUT_MS = 3000;
const EVALUATE_TIMEOUT_MS = 10000;

class BrowserError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BrowserError';
  }
}

function file() { return inData('mcp-browser-allowlist.json'); }

function readConfig() {
  try { return JSON.parse(fs.readFileSync(file(), 'utf8')) || {}; } catch (_) { return {}; }
}

function domains() {
  const list = readConfig().domains;
  return (Array.isArray(list) ? list : [])
    .filter((d) => typeof d === 'string' && d.length > 0)
    .map((d) => d.trim().toLowerCase().replace(/^\.+/, ''));
}

function saveDomains(next) {
  const unique = [...new Set((Array.isArray(next) ? next : [])
    .filter((d) => typeof d === 'string' && d.length > 0)
    .map((d) => d.trim().toLowerCase().replace(/^\.+/, '')))];
  fs.writeFileSync(file(), JSON.stringify({ domains: unique }, null, 2));
  return unique;
}

function port() {
  const raw = Number(process.env.MCP_BROWSER_PORT);
  return Number.isInteger(raw) && raw > 0 && raw < 65536 ? raw : DEFAULT_PORT;
}

function endpoint() { return `http://127.0.0.1:${port()}`; }

function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch (_) { return null; }
}

function isAllowed(url) {
  const approved = domains();
  if (approved.length === 0) return false;
  const host = hostOf(url);
  if (!host) return false;
  return approved.some((d) => host === d || host.endsWith('.' + d));
}

function requireAllowed(url) {
  const approved = domains();
  if (approved.length === 0) {
    throw new BrowserError(
      'no websites are approved for browser access — the user must approve at least one domain in Settings before the browser can be used'
    );
  }
  const scheme = (() => { try { return new URL(url).protocol; } catch (_) { return null; } })();
  if (scheme !== 'http:' && scheme !== 'https:') {
    throw new BrowserError(`only http and https addresses are allowed: ${url}`);
  }
  if (!isAllowed(url)) {
    throw new BrowserError(`${hostOf(url) || url} is not an approved website — approved: ${approved.join(', ')}`);
  }
}

async function cdpFetch(pathname, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);
  try {
    return await fetch(endpoint() + pathname, { ...init, signal: controller.signal });
  } catch (err) {
    throw new BrowserError(
      `no debuggable Chrome is reachable on port ${port()}. Chrome 136 and later ignore ` +
      `--remote-debugging-port on the default profile, so the user must start Chrome with both ` +
      `--remote-debugging-port=${port()} and --user-data-dir pointing at a separate folder, then sign in ` +
      `to the sites they want reachable inside that window. Tenari never launches or relaunches the ` +
      `browser on its own.`
    );
  } finally {
    clearTimeout(timer);
  }
}

async function version() {
  const res = await cdpFetch('/json/version');
  if (!res.ok) throw new BrowserError(`browser endpoint returned ${res.status}`);
  return res.json();
}

async function targets() {
  const res = await cdpFetch('/json/list');
  if (!res.ok) throw new BrowserError(`browser endpoint returned ${res.status}`);
  const all = await res.json();
  return (Array.isArray(all) ? all : []).filter((t) => t.type === 'page');
}

async function openTab(url) {
  requireAllowed(url);
  const res = await cdpFetch(`/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!res.ok) throw new BrowserError(`browser refused to open the tab (${res.status})`);
  return res.json();
}

async function evaluate(target, expression) {
  if (!target || !target.webSocketDebuggerUrl) throw new BrowserError('that tab cannot be inspected');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try { socket.close(); } catch (_) {  }
      reject(new BrowserError('the page did not respond in time'));
    }, EVALUATE_TIMEOUT_MS);
    const finish = (fn, value) => { clearTimeout(timer); try { socket.close(); } catch (_) {  } fn(value); };

    socket.addEventListener('error', () => finish(reject, new BrowserError('lost the connection to the browser')));
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true, awaitPromise: true },
      }));
    });
    socket.addEventListener('message', (event) => {
      let payload;
      try { payload = JSON.parse(event.data); } catch (_) { return; }
      if (payload.id !== 1) return;
      if (payload.error) return finish(reject, new BrowserError(payload.error.message || 'the page could not be read'));
      if (payload.result && payload.result.exceptionDetails) {
        return finish(reject, new BrowserError('the page could not be read'));
      }
      finish(resolve, payload.result && payload.result.result ? payload.result.result.value : null);
    });
  });
}

async function findTarget(url) {
  const pages = await targets();
  const wanted = String(url || '').toLowerCase();
  const match = pages.find((t) => String(t.url || '').toLowerCase() === wanted)
    || pages.find((t) => String(t.url || '').toLowerCase().startsWith(wanted));
  if (!match) throw new BrowserError(`no open tab matches ${url} — use browser_tabs to see what is open`);
  requireAllowed(match.url);
  return match;
}

module.exports = {
  BrowserError,
  domains,
  saveDomains,
  isAllowed,
  requireAllowed,
  port,
  endpoint,
  version,
  targets,
  openTab,
  evaluate,
  findTarget,
  file,
};
