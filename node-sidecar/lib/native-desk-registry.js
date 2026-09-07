'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CONTRACT = 'com.containedevolution.shell.native-clients';
const VERSION = 2;
const ID = /^[a-z][a-z0-9-]{1,62}$/;
const EXACT_VALUE_META = /[.*+?^${}()|[\]\\]/;

function text(value, label, max = 160) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) throw new Error(`Invalid ${label}.`);
  return value.trim();
}

function uniqueStrings(values, label, maxItems = 12) {
  if (!Array.isArray(values) || values.length < 1 || values.length > maxItems) throw new Error(`Invalid ${label}.`);
  const clean = values.map(value => text(value, label, 4096));
  if (new Set(clean).size !== clean.length) throw new Error(`Duplicate ${label}.`);
  return clean;
}

function exactKeys(input, allowed, label) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key))) throw new Error(`Invalid ${label} field.`);
}

function validation(input) {
  exactKeys(input, ['status', 'validatedAt', 'evidence'], 'native client validation');
  if (input.status !== 'passed') throw new Error('Native client capability validation has not passed.');
  const validatedAt = text(input.validatedAt, 'validation time');
  if (!Number.isFinite(Date.parse(validatedAt))) throw new Error('Invalid validation time.');
  return Object.freeze({ status: 'passed', validatedAt, evidence: text(input.evidence, 'validation evidence', 500) });
}

function exactValues(values, label) {
  const result = uniqueStrings(values, label);
  if (result.some(value => EXACT_VALUE_META.test(value))) throw new Error(`${label} values are exact, not patterns.`);
  return Object.freeze(result);
}

function normalizeLinux(input) {
  exactKeys(input, ['desktopId', 'executable', 'args', 'initialClasses', 'processExecutables', 'validation'], 'Linux native identity');
  const executable = text(input.executable, 'native executable', 4096);
  if (!path.posix.isAbsolute(executable)) throw new Error('Native executable must be an absolute Linux path.');
  if (!Array.isArray(input.args) || input.args.length > 24) throw new Error('Invalid native executable arguments.');
  const args = input.args.map(value => text(value, 'native executable argument', 500));
  const processExecutables = uniqueStrings(input.processExecutables, 'process executable');
  if (processExecutables.some(value => !path.posix.isAbsolute(value))) throw new Error('Process executables must be absolute Linux paths.');
  return Object.freeze({ platform: 'linux', desktopId: text(input.desktopId, 'desktop id', 200), executable, args: Object.freeze(args),
    initialClasses: exactValues(input.initialClasses, 'Initial class'), processExecutables: Object.freeze(processExecutables), validation: validation(input.validation) });
}

function normalizeRelativeWindowsPath(value) {
  const raw = text(value, 'Windows relative executable', 4096).replaceAll('/', '\\');
  const normalized = path.win32.normalize(raw);
  if (path.win32.isAbsolute(normalized) || normalized === '.' || normalized === '..' || normalized.startsWith(`..${path.win32.sep}`) || normalized.includes(':')) throw new Error('Windows executable must be a package-relative path.');
  return normalized.toLowerCase();
}

function normalizeWindows(input) {
  exactKeys(input, ['packageFamilyName', 'applicationUserModelId', 'relativeExecutables', 'windowClasses', 'validation'], 'Windows native identity');
  const packageFamilyName = text(input.packageFamilyName, 'package family name', 200);
  const applicationUserModelId = text(input.applicationUserModelId, 'application user model id', 300);
  if (!/^[A-Za-z0-9.-]+_[A-Za-z0-9]+$/.test(packageFamilyName) || !applicationUserModelId.startsWith(`${packageFamilyName}!`) || /\s/.test(applicationUserModelId)) throw new Error('Invalid packaged Windows application identity.');
  const relativeExecutables = uniqueStrings(input.relativeExecutables, 'Windows relative executable').map(normalizeRelativeWindowsPath);
  if (new Set(relativeExecutables).size !== relativeExecutables.length) throw new Error('Duplicate Windows relative executable.');
  return Object.freeze({ platform: 'win32', packageFamilyName, applicationUserModelId, relativeExecutables: Object.freeze(relativeExecutables),
    windowClasses: exactValues(input.windowClasses, 'Window class'), validation: validation(input.validation) });
}

function normalizeClient(input) {
  if (!input || !ID.test(input.clientId || '')) throw new Error('Invalid native client id.');
  exactKeys(input, ['clientId', 'label', 'identities'], 'native client');
  exactKeys(input.identities, ['linux', 'windows'], 'native client identities');
  if (!input.identities.linux && !input.identities.windows) throw new Error('A native client requires at least one platform identity.');
  const identities = {};
  if (input.identities.linux) identities.linux = normalizeLinux(input.identities.linux);
  if (input.identities.windows) identities.win32 = normalizeWindows(input.identities.windows);
  return Object.freeze({ clientId: input.clientId, label: text(input.label, 'native client label', 80), identities: Object.freeze(identities) });
}

function normalizeRegistry(input) {
  if (!input || input.contract !== CONTRACT || input.version !== VERSION || !Array.isArray(input.clients) || input.clients.length > 30) throw new Error('Unsupported native client registry.');
  exactKeys(input, ['contract', 'version', 'clients'], 'native registry');
  const clients = input.clients.map(normalizeClient);
  if (new Set(clients.map(client => client.clientId)).size !== clients.length) throw new Error('Duplicate native client id.');
  return Object.freeze({ contract: CONTRACT, version: VERSION, clients: Object.freeze(clients) });
}

function createRegistry(input, platform = process.platform) {
  const alreadyNormalized = Object.isFrozen(input) && Object.isFrozen(input?.clients) && input.contract === CONTRACT && input.version === VERSION;
  const normalized = alreadyNormalized ? input : normalizeRegistry(input);
  const clients = normalized.clients.flatMap(client => {
    const identity = client.identities[platform];
    return identity ? [Object.freeze({ clientId: client.clientId, label: client.label, ...identity })] : [];
  });
  const byId = new Map(clients.map(client => [client.clientId, client]));
  return Object.freeze({ contract: normalized.contract, version: normalized.version, platform, list: () => [...clients], get: clientId => byId.get(clientId) || null });
}

function loadRegistry(file, platform = process.platform) {
  return createRegistry(JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')), platform);
}

module.exports = { CONTRACT, VERSION, createRegistry, loadRegistry, normalizeClient, normalizeRegistry, normalizeRelativeWindowsPath };
