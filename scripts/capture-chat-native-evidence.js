#!/usr/bin/env node
'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createHyprlandBackend } = require('../node-sidecar/lib/hyprland-native-desk');

const exec = promisify(execFile);
async function run(file, args) {
  return (await exec(file, args, { timeout: 3000, maxBuffer: 1024 * 1024, windowsHide: true })).stdout;
}

// Observation only: no provider launch, registry write, compositor dispatch,
// credentials, conversation titles, command lines, or environment dump.
async function capture({ platform = process.platform, env = process.env, execute = run,
  backend = createHyprlandBackend({ run: execute }), now = Date.now } = {}) {
  const report = { contract: 'com.containedevolution.shell.chat-native-evidence', version: 1,
    observedAt: new Date(now()).toISOString(), platform, state: 'unavailable',
    capabilityComparison: 'not-performed', productionEligible: false, versionInfo: null, windows: [], monitors: [] };
  if (platform !== 'linux' || !env.HYPRLAND_INSTANCE_SIGNATURE) return { ...report, reason: 'Run inside the separate Linux Hyprland test session.' };
  try {
    const version = JSON.parse(await execute('hyprctl', ['-j', 'version']));
    const tag = String(version.tag || version.version || '');
    report.versionInfo = { tag, commit: typeof version.commit === 'string' ? version.commit : null,
      commandProfileCandidate: /^v?0\.55\./.test(tag) ? 'legacy-0.55' : 'unsupported' };
    const monitors = JSON.parse(await execute('hyprctl', ['-j', 'monitors']));
    if (!Array.isArray(monitors)) throw new Error('Invalid monitor inventory');
    report.monitors = monitors.map(monitor => Object.fromEntries(['id', 'name', 'x', 'y', 'width', 'height', 'scale', 'transform', 'focused', 'disabled']
      .filter(key => Object.hasOwn(monitor, key)).map(key => [key, monitor[key]])));
    report.windows = await backend.listWindows();
    report.state = 'observed';
    return report;
  } catch {
    return { ...report, reason: 'Native inventory was incomplete or inaccessible; no acceptance inferred.' };
  }
}

if (require.main === module) capture().then(report => {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.state !== 'observed') process.exitCode = 2;
}).catch(() => { process.stderr.write('Native evidence capture failed.\n'); process.exitCode = 2; });

module.exports = { capture };
