'use strict';

const { createNativeDeskBridge } = require('./native-desk-bridge');
const { PROFILE } = require('./chat-acceptance-install');

const WINDOW_LABEL = 'chat-acceptance';
const ASSET_ORIGIN = 'http://127.0.0.1:5984';
const ASSET_PREFIX = '/__shell/chat-acceptance/';

function exactObservation(value, prior = null) {
  if (!value || value.id !== PROFILE.id || value.version !== PROFILE.version || value.sha256 !== PROFILE.sha256 ||
      value.private !== true || value.stage !== PROFILE.stage || value.windowLabel !== WINDOW_LABEL || value.origin !== ASSET_ORIGIN ||
      value.alive !== true || !Number.isSafeInteger(value.processId) || value.processId < 1 || typeof value.windowId !== 'string' ||
      typeof value.nativeSessionId !== 'string' || typeof value.frameId !== 'string' || typeof value.navigationId !== 'string' ||
      typeof value.assetRoot !== 'string' || !value.assetRoot)
    throw new Error('Canonical Chat acceptance identity is unavailable.');
  let url;
  try { url = new URL(value.url); } catch { throw new Error('Canonical Chat acceptance navigation is invalid.'); }
  if (url.origin !== ASSET_ORIGIN || !url.pathname.startsWith(ASSET_PREFIX) || url.search || url.hash)
    throw new Error('Canonical Chat acceptance navigation left its verified asset origin.');
  if (prior && ['processId','windowId','nativeSessionId','frameId','navigationId'].some(key => value[key] !== prior[key]))
    throw new Error('Canonical Chat acceptance process, window, frame, or navigation changed.');
  return Object.freeze(structuredClone(value));
}

function createChatAcceptanceHost({ nativeLifecycle, backend, hostId, registry, acceptancePassed = false, now = Date.now } = {}) {
  if (!nativeLifecycle || typeof nativeLifecycle.observe !== 'function' || !backend) throw new Error('Trusted Chat acceptance lifecycle is required.');
  const peer = Object.freeze({ kind:'canonical-chat-acceptance-host' });
  let initial;
  let bridge;
  let port;
  let revoked = false;
  async function current() {
    if (revoked) throw new Error('Canonical Chat acceptance authority is revoked.');
    try { return exactObservation(await nativeLifecycle.observe(), initial); }
    catch (error) { revoked = true; throw error; }
  }
  async function connect() {
    if (port) throw new Error('Canonical Chat acceptance host is already connected.');
    initial = exactObservation(await nativeLifecycle.observe());
    const identity = { pid:initial.processId, windowId:initial.windowId, nativeSessionId:initial.nativeSessionId,
      processExecutable:initial.assetRoot, initialClass:WINDOW_LABEL, workspaceId:initial.workspaceId };
    bridge = createNativeDeskBridge({ peer, chatIdentity:identity, backend, hostId, registry, acceptancePassed, now,
      readChatWindow:async () => { const item=await current(); return { ...identity, pid:item.processId, windowId:item.windowId,
        nativeSessionId:item.nativeSessionId, at:item.windowBounds.slice(0,2), size:item.windowBounds.slice(2), workspaceId:item.workspaceId }; },
      readLayout:async () => (await current()).layout });
    port = bridge.connect(peer);
    return port;
  }
  async function close() { revoked = true; if (bridge) await bridge.close(peer); }
  return Object.freeze({ connect, close, get revoked() { return revoked; } });
}

module.exports = { ASSET_ORIGIN, ASSET_PREFIX, WINDOW_LABEL, createChatAcceptanceHost, exactObservation };
