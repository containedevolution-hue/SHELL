'use strict';

const crypto = require('node:crypto');
const path = require('node:path');

const HANDLE = /^0x[0-9a-f]+$/i;
const REQUIRED_DRIVER_METHODS = Object.freeze(['probe', 'listWindows', 'applicationFound', 'activate', 'minimize', 'restore', 'place', 'focus']);
const PROHIBITED_DRIVER_METHODS = Object.freeze(['kill', 'terminate', 'close', 'hide', 'setParent', 'execute', 'command']);

function windowsRelative(root, executable) {
  if (typeof root !== 'string' || typeof executable !== 'string' || !path.win32.isAbsolute(root) || !path.win32.isAbsolute(executable)) return null;
  const relative = path.win32.relative(path.win32.normalize(root), path.win32.normalize(executable));
  if (!relative || path.win32.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.win32.sep}`)) return null;
  return path.win32.normalize(relative).toLowerCase();
}

function digest(parts) {
  return crypto.createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 24);
}

function normalizeRect(value) {
  return Array.isArray(value) && value.length === 4 && value.every(Number.isSafeInteger) && value[2] >= 1 && value[3] >= 1 ? [...value] : null;
}

function createWindowsBackend({
  platform = process.platform,
  env = process.env,
  enabled = env.SHELL_CHAT_NATIVE_DESK === 'enabled',
  driver = null,
  driverAccepted = false,
  waitMs = 5000,
  pollMs = 100,
  now = Date.now,
} = {}) {
  const placements = new Map();

  function driverShapeAccepted() {
    return Boolean(driver && driverAccepted && REQUIRED_DRIVER_METHODS.every(name => typeof driver[name] === 'function') &&
      PROHIBITED_DRIVER_METHODS.every(name => typeof driver[name] !== 'function'));
  }

  async function probe() {
    if (platform !== 'win32') return { available: false, compositor: 'Windows native window manager unavailable' };
    if (!enabled) return { available: false, compositor: 'Windows native desk disabled' };
    if (!driverShapeAccepted()) return { available: false, compositor: 'Trusted Windows native driver unavailable' };
    try {
      const result = await driver.probe();
      return result?.available === true
        ? { available: true, compositor: String(result.name || 'Windows native window manager') }
        : { available: false, compositor: 'Windows native window control unavailable' };
    } catch {
      return { available: false, compositor: 'Windows native window control unavailable' };
    }
  }

  function normalizeWindow(raw) {
    if (!raw || !Number.isSafeInteger(raw.pid) || raw.pid < 1 || !HANDLE.test(raw.hwnd || '') ||
        typeof raw.processStartTime !== 'string' || !raw.processStartTime ||
        typeof raw.packageFamilyName !== 'string' || typeof raw.applicationUserModelId !== 'string' ||
        typeof raw.packageFullName !== 'string' || !raw.packageFullName || typeof raw.windowClass !== 'string') return null;
    const relativeExecutable = windowsRelative(raw.packageInstallRoot, raw.processExecutable);
    if (!relativeExecutable) return null;
    const hwnd = raw.hwnd.toLowerCase();
    const root = typeof raw.rootHwnd === 'string' ? raw.rootHwnd.toLowerCase() : '';
    const owner = raw.ownerHwnd == null ? '0x0' : String(raw.ownerHwnd).toLowerCase();
    const rect = normalizeRect(raw.visualBounds);
    if (root !== hwnd || owner !== '0x0' || !rect || !Number.isSafeInteger(raw.dpi) || raw.dpi < 1) return null;
    const sessionHash = digest([raw.packageFamilyName, raw.applicationUserModelId, String(raw.pid), raw.processStartTime, relativeExecutable]);
    const eligibleWindow = raw.userWindow === true && (raw.visible === true || raw.iconic === true) && (raw.cloaked !== true || raw.iconic === true);
    const packageTrusted = raw.packageStatus === 'ok' && raw.signatureTrusted === true;
    return Object.freeze({
      platform: 'win32', pid: raw.pid, processStartTime: raw.processStartTime, rawHwnd: hwnd,
      windowId: `hwnd-${hwnd.slice(2)}-${sessionHash}`, nativeSessionId: `process-${raw.pid}-${sessionHash}`,
      packageFamilyName: raw.packageFamilyName, applicationUserModelId: raw.applicationUserModelId,
      packageFullName: raw.packageFullName, relativeExecutable, windowClass: raw.windowClass,
      visible: raw.visible === true, iconic: raw.iconic === true, cloaked: raw.cloaked === true,
      controllable: eligibleWindow && packageTrusted && raw.elevated !== true && raw.onCurrentDesktop === true && raw.controllable === true,
      visualBounds: rect, dpi: raw.dpi, focused: raw.focused === true,
      placement: raw.placement == null ? null : structuredClone(raw.placement),
    });
  }

  async function listWindows() {
    if (!(await probe()).available) return [];
    const before = await driver.listWindows();
    if (!Array.isArray(before)) throw new Error('Invalid Windows native window inventory.');
    return before.map(normalizeWindow).filter(Boolean);
  }

  function sameWindow(left, right) {
    return Boolean(left && right && left.rawHwnd === right.rawHwnd && left.windowId === right.windowId && left.nativeSessionId === right.nativeSessionId &&
      left.pid === right.pid && left.processStartTime === right.processStartTime && left.packageFullName === right.packageFullName);
  }

  async function current(expected) {
    const found = (await listWindows()).find(window => window.rawHwnd === expected.rawHwnd);
    if (!sameWindow(found, expected) || found.controllable !== true) throw new Error('Windows native window identity changed or is not controllable.');
    return found;
  }

  function guard(window) {
    return Object.freeze({ hwnd: window.rawHwnd, pid: window.pid, processStartTime: window.processStartTime,
      packageFamilyName: window.packageFamilyName, applicationUserModelId: window.applicationUserModelId,
      packageFullName: window.packageFullName, relativeExecutable: window.relativeExecutable, windowClass: window.windowClass });
  }

  function location(window, slot) {
    if (window.iconic) return 'parked';
    const expected = [slot.x, slot.y, slot.width, slot.height];
    if (window.controllable && window.visible && !window.cloaked && expected.every((value, index) => window.visualBounds[index] === value)) return 'attached';
    return 'standalone';
  }

  async function minimizeVerified(window) {
    const before = await current(window);
    await driver.minimize(guard(before));
    const after = await current(before);
    if (!after.iconic) throw new Error('Windows native window minimize outcome is unverified.');
    return after;
  }

  async function placeVerified(window, slot) {
    let before = await current(window);
    if (!placements.has(before.nativeSessionId)) {
      if (before.placement == null) throw new Error('Windows native window placement is unavailable.');
      placements.set(before.nativeSessionId, structuredClone(before.placement));
    }
    if (before.iconic) {
      await driver.restore(guard(before), null);
      before = await current(before);
      if (before.iconic) throw new Error('Windows native window restore outcome is unverified.');
    }
    await driver.place(guard(before), Object.freeze({ x: slot.x, y: slot.y, width: slot.width, height: slot.height }));
    let after = await current(before);
    if (location(after, slot) !== 'attached') throw new Error('Windows native window placement outcome is unverified.');
    const focused = await driver.focus(guard(after));
    after = await current(after);
    if (focused !== true && !after.focused) throw new Error('Windows native window focus outcome is unverified.');
    return after;
  }

  async function switchWindows({ park, target, slot }) {
    if (park && !sameWindow(park, target)) await minimizeVerified(park);
    await placeVerified(target, slot);
  }

  async function park(window) {
    await minimizeVerified(window);
  }

  async function openStandalone(window, slot) {
    const before = await current(window);
    const prior = placements.get(before.nativeSessionId);
    if (!prior) throw new Error('No verified standalone placement exists for this native session.');
    await driver.restore(guard(before), structuredClone(prior));
    let after = await current(before);
    if (after.iconic || !after.visible || location(after, slot) !== 'standalone') throw new Error('Windows standalone restore outcome is unverified.');
    const focused = await driver.focus(guard(after));
    after = await current(after);
    if (focused !== true && !after.focused) throw new Error('Windows standalone focus outcome is unverified.');
  }

  async function applicationFound(entry) {
    if (!(await probe()).available || entry?.platform !== 'win32') return false;
    return (await driver.applicationFound(Object.freeze({ packageFamilyName: entry.packageFamilyName,
      applicationUserModelId: entry.applicationUserModelId, relativeExecutables: [...entry.relativeExecutables] }))) === true;
  }

  async function launch(entry) {
    if (!await applicationFound(entry)) throw new Error('Registered packaged Windows application is unavailable.');
    await driver.activate(Object.freeze({ packageFamilyName: entry.packageFamilyName, applicationUserModelId: entry.applicationUserModelId }));
  }

  async function waitForWindow(_entry, predicate) {
    const deadline = now() + waitMs;
    while (now() < deadline) {
      const found = (await listWindows()).filter(predicate);
      if (found.length === 1) return found[0];
      if (found.length > 1) throw new Error('Multiple registered Windows application windows appeared.');
      await new Promise(resolve => setTimeout(resolve, pollMs));
    }
    throw new Error('Timed out waiting for the registered Windows application window.');
  }

  function describe(_window, state) {
    if (state === 'attached') return 'Verified packaged Windows application occupies the Chat slot.';
    if (state === 'parked') return 'Verified packaged Windows application remains running and is minimized.';
    return 'Verified packaged Windows application is running separately.';
  }

  return Object.freeze({ probe, listWindows, location, describe, switch: switchWindows, park, openStandalone, applicationFound, launch, waitForWindow });
}

module.exports = { createWindowsBackend, windowsRelative };
