'use strict';

const crypto = require('node:crypto');
const readline = require('node:readline');

const PREFIX = '@@SHELL_NATIVE_DESK_V1@@';
const MAX_FRAME = 64 * 1024;
const OPS = new Set(['probe', 'listWindows', 'applicationFound', 'activate', 'minimize', 'restore', 'place', 'focus', 'chatObserve']);
let inheritedPort;

function exactKeys(value, keys) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key)));
}

function mac(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function encode(secret, value) {
  const payload = Buffer.from(JSON.stringify(value), 'utf8').toString('hex');
  const frame = `${PREFIX}${JSON.stringify({ payload, mac: mac(secret, payload) })}\n`;
  if (Buffer.byteLength(frame) > MAX_FRAME) throw new Error('Native desk frame is too large.');
  return frame;
}

function decode(secret, line) {
  if (typeof line !== 'string' || !line.startsWith(PREFIX) || Buffer.byteLength(line) > MAX_FRAME) return null;
  try {
    const outer = JSON.parse(line.slice(PREFIX.length));
    if (!exactKeys(outer, ['payload', 'mac']) || !/^(?:[0-9a-f]{2})+$/i.test(outer.payload) || !safeEqual(mac(secret, outer.payload), outer.mac)) return null;
    return JSON.parse(Buffer.from(outer.payload, 'hex').toString('utf8'));
  } catch { return null; }
}

function createInheritedWindowsNativeDeskDriver({
  env = process.env, input = process.stdin, output = process.stdout,
  platform = process.platform, parentPid = process.ppid, childPid = process.pid, timeoutMs = 1500,
  randomUUID = crypto.randomUUID, setTimer = setTimeout, clearTimer = clearTimeout,
} = {}) {
  const secret = env.SHELL_NATIVE_DESK_SECRET;
  const sessionId = env.SHELL_NATIVE_DESK_SESSION;
  const expectedParent = Number(env.SHELL_NATIVE_DESK_PARENT_PID);
  if (platform !== 'win32' || env.SHELL_NATIVE_DESK_PIPE !== 'enabled' ||
      typeof secret !== 'string' || secret.length < 64 || typeof sessionId !== 'string' ||
      !Number.isSafeInteger(expectedParent) || expectedParent !== parentPid || !input || !output) return null;
  if (env === process.env) {
    delete env.SHELL_NATIVE_DESK_SECRET;
    delete env.SHELL_NATIVE_DESK_SESSION;
    delete env.SHELL_NATIVE_DESK_PARENT_PID;
    delete env.SHELL_NATIVE_DESK_PIPE;
  }

  let sequence = 0;
  let closed = false;
  const pending = new Map();
  const refs = new Map();
  const reader = readline.createInterface({ input, crlfDelay: Infinity, terminal: false });

  function rejectAll(message) {
    if (closed) return;
    closed = true;
    for (const { reject, timer } of pending.values()) { clearTimer(timer); reject(new Error(message)); }
    pending.clear();
  }

  reader.on('line', line => {
    const reply = decode(secret, line);
    if (!reply || !exactKeys(reply, ['v', 'sessionId', 'parentPid', 'childPid', 'requestId', 'nonce', 'ok', 'result', 'error']) ||
        reply.v !== 1 || reply.sessionId !== sessionId || reply.parentPid !== expectedParent || reply.childPid !== childPid ||
        typeof reply.requestId !== 'string' || typeof reply.nonce !== 'string' || typeof reply.ok !== 'boolean') return;
    const waiting = pending.get(reply.requestId);
    if (!waiting || waiting.nonce !== reply.nonce) return;
    pending.delete(reply.requestId);
    clearTimer(waiting.timer);
    if (reply.ok) waiting.resolve(reply.result);
    else waiting.reject(new Error(typeof reply.error === 'string' ? reply.error : 'Native desk request failed.'));
  });
  reader.on('close', () => rejectAll('Native desk channel disconnected.'));
  reader.on('error', () => rejectAll('Native desk channel disconnected.'));

  function request(op, body = {}) {
    if (closed || !OPS.has(op) || !exactKeys(body, Object.keys(body))) return Promise.reject(new Error('Native desk channel is unavailable.'));
    const requestId = `${childPid}-${++sequence}-${randomUUID()}`;
    const nonce = randomUUID();
    const frame = encode(secret, { v: 1, sessionId, parentPid: expectedParent, childPid, requestId, nonce, op, body });
    return new Promise((resolve, reject) => {
      const timer = setTimer(() => {
        pending.delete(requestId);
        reject(new Error('Native desk request timed out; reconciliation is required.'));
      }, timeoutMs);
      pending.set(requestId, { nonce, resolve, reject, timer });
      output.write(frame, error => {
        if (!error) return;
        const waiting = pending.get(requestId);
        if (waiting) { pending.delete(requestId); clearTimer(timer); reject(new Error('Native desk channel disconnected.')); }
      });
    });
  }

  function reference(guard) {
    const value = refs.get(`${guard.clientId}\0${guard.hwnd}\0${guard.pid}\0${guard.processStartTime}`);
    if (!value) throw new Error('Native desk window reference is absent or stale.');
    return { clientId: guard.clientId, windowRef: value };
  }

  const driver = {
    probe: () => request('probe'),
    listWindows: async () => {
      const windows = await request('listWindows');
      if (!Array.isArray(windows)) throw new Error('Invalid native desk inventory.');
      refs.clear();
      for (const window of windows) {
        if (typeof window?.clientId === 'string' && typeof window?.windowRef === 'string')
          refs.set(`${window.clientId}\0${window.hwnd}\0${window.pid}\0${window.processStartTime}`, window.windowRef);
      }
      return windows;
    },
    applicationFound: entry => request('applicationFound', { clientId: entry.clientId }),
    activate: entry => request('activate', { clientId: entry.clientId }),
    minimize: guard => request('minimize', reference(guard)),
    restore: (guard, placement) => request('restore', { ...reference(guard), mode: placement == null ? 'normal' : 'standalone' }),
    place: (guard, rect) => request('place', { ...reference(guard), rect }),
    focus: guard => request('focus', reference(guard)),
  };
  const lifecycle = Object.freeze({ observe: () => request('chatObserve') });
  return Object.freeze({ driver: Object.freeze(driver), lifecycle, accepted: true, close: () => { reader.close(); rejectAll('Native desk channel disconnected.'); } });
}

function initializeInheritedWindowsNativeDeskDriver(options) {
  if (inheritedPort !== undefined) return inheritedPort;
  inheritedPort = createInheritedWindowsNativeDeskDriver(options);
  return inheritedPort;
}

function getInheritedWindowsNativeDeskDriver() { return inheritedPort || null; }

module.exports = { MAX_FRAME, PREFIX, createInheritedWindowsNativeDeskDriver, decode, encode,
  getInheritedWindowsNativeDeskDriver, initializeInheritedWindowsNativeDeskDriver };
