'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CONTRACT = 'com.containedevolution.shell.native-clients';
const VERSION = 1;
const ID = /^[a-z][a-z0-9-]{1,62}$/;

function text(value, label, max = 160) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
  return value.trim();
}

function uniqueStrings(values, label, maxItems = 12) {
  if (!Array.isArray(values) || values.length < 1 || values.length > maxItems) throw new Error(`Invalid ${label}.`);
  const clean = values.map(value => text(value, label));
  if (new Set(clean).size !== clean.length) throw new Error(`Duplicate ${label}.`);
  return clean;
}

function exactKeys(input, allowed, label) {
  if (Object.keys(input).some(key => !allowed.includes(key))) throw new Error(`Invalid ${label} field.`);
}

function normalizeClient(input) {
  if (!input || !ID.test(input.clientId || '')) throw new Error('Invalid native client id.');
  exactKeys(input, ['clientId', 'label', 'desktopId', 'executable', 'args', 'identity', 'validation'], 'native client');
  if (!input.identity || !input.validation) throw new Error('Invalid native client evidence.');
  exactKeys(input.identity, ['initialClasses', 'processExecutables'], 'native client identity');
  exactKeys(input.validation, ['status', 'validatedAt', 'evidence'], 'native client validation');
  const executable = text(input.executable, 'native executable', 4096);
  if (!path.posix.isAbsolute(executable)) throw new Error('Native executable must be an absolute Linux path.');
  if (!Array.isArray(input.args) || input.args.length > 24) throw new Error('Invalid native executable arguments.');
  const args = input.args.map(value => text(value, 'native executable argument', 500));
  const initialClasses = uniqueStrings(input.identity?.initialClasses, 'initial class');
  const processExecutables = uniqueStrings(input.identity?.processExecutables, 'process executable', 12);
  if (initialClasses.some(value => /[.*+?^${}()|[\]\\]/.test(value))) throw new Error('Initial classes are exact values, not patterns.');
  if (processExecutables.some(value => !path.posix.isAbsolute(value))) throw new Error('Process executables must be absolute Linux paths.');
  if (input.validation?.status !== 'passed') throw new Error('Native client capability validation has not passed.');
  const validatedAt = text(input.validation.validatedAt, 'validation time');
  if (!Number.isFinite(Date.parse(validatedAt))) throw new Error('Invalid validation time.');
  return Object.freeze({
    clientId: input.clientId,
    label: text(input.label, 'native client label', 80),
    desktopId: text(input.desktopId, 'desktop id', 200),
    executable,
    args: Object.freeze(args),
    identity: Object.freeze({ initialClasses: Object.freeze(initialClasses), processExecutables: Object.freeze(processExecutables) }),
    validation: Object.freeze({ status: 'passed', validatedAt, evidence: text(input.validation.evidence, 'validation evidence', 500) }),
  });
}

function normalizeRegistry(input) {
  if (!input || input.contract !== CONTRACT || input.version !== VERSION || !Array.isArray(input.clients) || input.clients.length > 30) {
    throw new Error('Unsupported native client registry.');
  }
  exactKeys(input, ['contract', 'version', 'clients'], 'native registry');
  const clients = input.clients.map(normalizeClient);
  if (new Set(clients.map(client => client.clientId)).size !== clients.length) throw new Error('Duplicate native client id.');
  return Object.freeze({ contract: CONTRACT, version: VERSION, clients: Object.freeze(clients) });
}

function loadRegistry(file) {
  const resolved = path.resolve(file);
  return normalizeRegistry(JSON.parse(fs.readFileSync(resolved, 'utf8')));
}

function createRegistry(input) {
  const normalized = normalizeRegistry(input);
  const byId = new Map(normalized.clients.map(client => [client.clientId, client]));
  return Object.freeze({
    contract: normalized.contract,
    version: normalized.version,
    list: () => [...normalized.clients],
    get: clientId => byId.get(clientId) || null,
  });
}

module.exports = { CONTRACT, VERSION, createRegistry, loadRegistry, normalizeClient, normalizeRegistry };
