'use strict';

const path = require('node:path');
const { createChatAcceptanceHost } = require('./chat-acceptance-host');
const { createWindowsBackend } = require('./windows-native-desk');
const { loadRegistry } = require('./native-desk-registry');

const DEFAULT_REGISTRY = path.join(__dirname, '..', 'config', 'native-desk-clients.json');

// This watcher lives only inside the authenticated sidecar process. It neither
// mounts a route nor passes native observation or authority to page content.
function startChatAcceptanceRuntime({ nativePort, env = process.env, platform = process.platform,
  registryFile = DEFAULT_REGISTRY, intervalMs = 250, setIntervalFn = setInterval,
  clearIntervalFn = clearInterval, hostFactory = createChatAcceptanceHost } = {}) {
  if (platform !== 'win32' || env.SHELL_CHAT_ACCEPTANCE_WINDOW !== 'enabled' || !nativePort?.accepted ||
      typeof nativePort.lifecycle?.observe !== 'function') return null;
  const backend = createWindowsBackend({ platform, env, driver: nativePort.driver, driverAccepted: true });
  const registry = loadRegistry(registryFile, platform);
  let host = null, port = null, busy = false, stopped = false;
  async function tick() {
    if (busy || stopped) return;
    busy = true;
    try {
      if (!port) {
        host = hostFactory({ nativeLifecycle:nativePort.lifecycle, backend, registry, hostId:'shell-chat-acceptance', acceptancePassed:false });
        port = await host.connect();
      }
      await port.observe();
    } catch {
      if (host) await host.close().catch(() => {});
      host = null; port = null;
    } finally { busy = false; }
  }
  const timer = setIntervalFn(tick, intervalMs);
  timer?.unref?.();
  tick();
  return Object.freeze({
    close: async () => { stopped = true; clearIntervalFn(timer); if (host) await host.close().catch(() => {}); host=null; port=null; },
    get connected() { return Boolean(port); },
  });
}

module.exports = { DEFAULT_REGISTRY, startChatAcceptanceRuntime };
