'use strict';

const { randomUUID } = require('node:crypto');
const { createNativeDeskService } = require('./native-desk-service');
const { resolveNativeDeskSlot } = require('./native-desk-geometry');

// Object-capability boundary for a trusted in-process Chat host. The bootstrap,
// peer object and native layout reader must NEVER be exported to page content,
// IPC registration, an HTTP route, a global callback, or a query parameter.
// A future Tauri transport must authenticate its native caller before reaching
// this port. Object identity does not authenticate serialized IPC by itself.
function createNativeDeskBridge({ peer, chatIdentity, readLayout, backend, hostId,
  registry, registryFile, acceptancePassed = false, now = Date.now } = {}) {
  if (!peer || typeof peer !== 'object' || !chatIdentity || typeof readLayout !== 'function' || !backend) throw new Error('Trusted Chat bootstrap is required.');
  const identity = Object.freeze(structuredClone(chatIdentity));
  let tail = Promise.resolve();
  let service;
  let revoked = false;
  let connected = false;
  const hostSessionId = `chat-${randomUUID()}`;
  const enqueue = operation => {
    const result = tail.then(operation);
    tail = result.catch(() => {});
    return result;
  };
  function authenticate(caller) {
    if (caller !== peer || revoked) throw new Error('Chat host authority is absent or revoked.');
  }
  async function synchronize() {
    try {
      const windows = await backend.listWindows();
      const window = windows.find(item => item.windowId === identity.windowId);
      const slot = resolveNativeDeskSlot({ window, identity, layout: await readLayout(), now: now() });
      if (!service) service = createNativeDeskService({ backend, registry, registryFile, slot, hostId, hostSessionId, acceptancePassed, now });
      else await service.updateSlot(slot);
    } catch (error) {
      revoked = true;
      // Loss of identity/geometry cannot leave a previously owned overlay active.
      // If parking itself is uncertain, retain the service for trusted close retry.
      try { await service?.closeChat(); }
      catch { throw new Error('Chat authority revoked; native parking outcome requires recovery observation.'); }
      throw error;
    }
  }
  function call(caller, method, input) {
    try { authenticate(caller); }
    catch (error) { return Promise.reject(error); }
    let copy;
    try { copy = input === undefined ? undefined : structuredClone(input); }
    catch { return Promise.reject(new Error('Invalid Chat host request.')); }
    return enqueue(async () => {
      authenticate(caller);
      await synchronize();
      authenticate(caller); // close can revoke while native inspection is in flight
      return service[method](copy);
    });
  }
  function connect(caller) {
    authenticate(caller);
    if (connected) throw new Error('Chat host is already connected.');
    connected = true;
    return Object.freeze({ observe: () => call(caller, 'observe'), manage: request => call(caller, 'manage', request), health: request => call(caller, 'health', request) });
  }
  function close(caller) {
    if (caller !== peer) return Promise.reject(new Error('Chat host authority is absent.'));
    revoked = true;
    return enqueue(() => service?.closeChat());
  }
  // Native resize/move/monitor callbacks and a native liveness watchdog must use
  // refresh, even when Chat has no pending request. No timer is hidden here.
  function refresh(caller) {
    return call(caller, 'observe');
  }
  return Object.freeze({ connect, close, refresh });
}

module.exports = { createNativeDeskBridge };
