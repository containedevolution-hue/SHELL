'use strict';

const path = require('node:path');
const { createHyprlandBackend } = require('./hyprland-native-desk');
const { createNativeDeskManager } = require('./native-desk-manager');
const { createRegistry, loadRegistry } = require('./native-desk-registry');

const DEFAULT_REGISTRY = path.join(__dirname, '..', 'config', 'native-desk-clients.json');

// This factory is the trusted in-process host port consumed by a future Tauri
// bridge. It deliberately mounts no HTTP route and reads no page-supplied path,
// command, URL, acceptance flag, or provider credential.
function createNativeDeskService({
  registryFile = DEFAULT_REGISTRY,
  registry: suppliedRegistry,
  backend = createHyprlandBackend(),
  slot,
  hostId,
  hostSessionId,
  acceptancePassed = false,
  now,
} = {}) {
  const registry = suppliedRegistry || loadRegistry(registryFile);
  const normalizedRegistry = typeof registry.get === 'function' ? registry : createRegistry(registry);
  return createNativeDeskManager({ registry: normalizedRegistry, backend, slot, hostId, hostSessionId, accepted: acceptancePassed, now });
}

module.exports = { DEFAULT_REGISTRY, createNativeDeskService };
