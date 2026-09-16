'use strict';

const path = require('node:path');
const { createHyprlandBackend } = require('./hyprland-native-desk');
const { createNativeDeskManager } = require('./native-desk-manager');
const { createRegistry, loadRegistry } = require('./native-desk-registry');
const { createWindowsBackend } = require('./windows-native-desk');
const { getInheritedWindowsNativeDeskDriver } = require('./windows-native-desk-transport');

const DEFAULT_REGISTRY = path.join(__dirname, '..', 'config', 'native-desk-clients.json');

// This factory is consumed by native-desk-bridge's trusted in-process port.
// It deliberately mounts no HTTP route and reads no page-supplied path,
// command, URL, acceptance flag, or provider credential.
function createNativeDeskService({
  registryFile = DEFAULT_REGISTRY,
  registry: suppliedRegistry,
  backend: suppliedBackend,
  platform = process.platform,
  env = process.env,
  windowsDriver = null,
  windowsDriverAccepted = false,
  slot,
  hostId,
  hostSessionId,
  acceptancePassed = false,
  now,
} = {}) {
  const inherited = platform === 'win32' ? getInheritedWindowsNativeDeskDriver() : null;
  const backend = suppliedBackend || (platform === 'win32'
    ? createWindowsBackend({ platform, env, driver: windowsDriver || inherited?.driver,
      driverAccepted: windowsDriverAccepted || inherited?.accepted === true })
    : createHyprlandBackend({ platform, env }));
  const registry = suppliedRegistry || loadRegistry(registryFile, platform);
  const normalizedRegistry = typeof registry.get === 'function' ? registry : createRegistry(registry, platform);
  return createNativeDeskManager({ registry: normalizedRegistry, backend, slot, hostId, hostSessionId, accepted: acceptancePassed, now });
}

module.exports = { DEFAULT_REGISTRY, createNativeDeskService };
