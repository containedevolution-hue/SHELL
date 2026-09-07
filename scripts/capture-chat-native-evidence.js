#!/usr/bin/env node
'use strict';

const { execFile } = require('node:child_process');
const { promises: fs } = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const { createHyprlandBackend } = require('../node-sidecar/lib/hyprland-native-desk');

const exec = promisify(execFile);
const CONTRACT = 'com.containedevolution.shell.chat-native-evidence';
const WINDOWS_COLLECTOR = path.join(__dirname, 'capture-chat-native-evidence-windows.ps1');

async function run(file, args) {
  return (await exec(file, args, { timeout: 10_000, maxBuffer: 1024 * 1024, windowsHide: true })).stdout;
}

function baseReport(platform, now) {
  return { contract: CONTRACT, version: 1, observedAt: new Date(now()).toISOString(), platform,
    state: 'unavailable', capabilityComparison: 'not-performed', productionEligible: false,
    versionInfo: null, windows: [], monitors: [] };
}

function exactString(value, label, maximum = 512) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || /[\u0000-\u001f]/.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

function integer(value, label, { minimum = Number.MIN_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`Invalid ${label}.`);
  return value;
}

function boolean(value, label) {
  if (typeof value !== 'boolean') throw new Error(`Invalid ${label}.`);
  return value;
}

function rect(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}.`);
  return {
    x: integer(value.x, `${label}.x`, { minimum: -100_000, maximum: 100_000 }),
    y: integer(value.y, `${label}.y`, { minimum: -100_000, maximum: 100_000 }),
    width: integer(value.width, `${label}.width`, { minimum: 1, maximum: 100_000 }),
    height: integer(value.height, `${label}.height`, { minimum: 1, maximum: 100_000 }),
  };
}

function parseWindowsObservation(stdout) {
  const parsed = JSON.parse(stdout);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
    || !Array.isArray(parsed.windows) || !Array.isArray(parsed.monitors)
    || parsed.windows.length > 20 || parsed.monitors.length > 16) {
    throw new Error('Invalid Windows evidence response.');
  }
  const windows = parsed.windows.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid windows[${index}].`);
    const clientCandidate = exactString(value.clientCandidate, `windows[${index}].clientCandidate`, 16);
    if (!['chatgpt', 'claude'].includes(clientCandidate)) throw new Error(`Invalid windows[${index}].clientCandidate.`);
    const packageFamilyName = exactString(value.packageFamilyName, `windows[${index}].packageFamilyName`);
    const applicationUserModelId = exactString(value.applicationUserModelId, `windows[${index}].applicationUserModelId`);
    if (!applicationUserModelId.startsWith(`${packageFamilyName}!`)) throw new Error(`Invalid windows[${index}] application identity.`);
    const relativeExecutable = exactString(value.relativeExecutable, `windows[${index}].relativeExecutable`);
    if (path.win32.isAbsolute(relativeExecutable) || relativeExecutable.includes(':')
      || relativeExecutable.split(/[\\/]+/).some(part => !part || part === '.' || part === '..')) {
      throw new Error(`Invalid windows[${index}].relativeExecutable.`);
    }
    return {
      clientCandidate, packageFamilyName, applicationUserModelId,
      packageFullName: exactString(value.packageFullName, `windows[${index}].packageFullName`),
      relativeExecutable: relativeExecutable.replaceAll('/', '\\').toLowerCase(),
      windowClass: exactString(value.windowClass, `windows[${index}].windowClass`, 256),
      pid: integer(value.pid, `windows[${index}].pid`, { minimum: 1, maximum: 0xffffffff }),
      processStartTime: exactString(value.processStartTime, `windows[${index}].processStartTime`, 32),
      hwnd: exactString(value.hwnd, `windows[${index}].hwnd`, 32),
      rootSelf: boolean(value.rootSelf, `windows[${index}].rootSelf`),
      ownerAbsent: boolean(value.ownerAbsent, `windows[${index}].ownerAbsent`),
      visible: boolean(value.visible, `windows[${index}].visible`),
      iconic: boolean(value.iconic, `windows[${index}].iconic`),
      cloaked: boolean(value.cloaked, `windows[${index}].cloaked`),
      toolWindow: boolean(value.toolWindow, `windows[${index}].toolWindow`),
      bounds: rect(value.bounds, `windows[${index}].bounds`),
      dpi: integer(value.dpi, `windows[${index}].dpi`, { minimum: 1, maximum: 960 }),
    };
  });
  const monitors = parsed.monitors.map((value, index) => ({
    index: integer(value.index, `monitors[${index}].index`, { minimum: 0, maximum: 15 }),
    primary: boolean(value.primary, `monitors[${index}].primary`),
    bounds: rect(value.bounds, `monitors[${index}].bounds`),
    workingArea: rect(value.workingArea, `monitors[${index}].workingArea`),
  }));
  return { windows, monitors };
}

async function captureWindows({ execute, powershell = 'powershell.exe' }) {
  const stdout = await execute(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', WINDOWS_COLLECTOR]);
  return parseWindowsObservation(stdout);
}

// Observation only: no provider launch, registry write, window mutation,
// credentials, conversation titles, command lines, or environment dump.
async function capture({ platform = process.platform, env = process.env, execute = run,
  backend = createHyprlandBackend({ run: execute }), now = Date.now, powershell } = {}) {
  const report = baseReport(platform, now);
  if (platform === 'win32') {
    try {
      return { ...report, state: 'observed', ...(await captureWindows({ execute, powershell })) };
    } catch {
      return { ...report, reason: 'Windows package/window inventory was incomplete or inaccessible; no acceptance inferred.' };
    }
  }
  if (platform !== 'linux' || !env.HYPRLAND_INSTANCE_SIGNATURE) {
    return { ...report, reason: platform === 'linux'
      ? 'Run inside the separate Linux Hyprland test session.' : 'This platform has no evidence collector.' };
  }
  try {
    const version = JSON.parse(await execute('hyprctl', ['-j', 'version']));
    const tag = String(version.tag || version.version || '');
    report.versionInfo = { tag, commit: typeof version.commit === 'string' ? version.commit : null,
      commandProfileCandidate: /^v?0\.55\./.test(tag) ? 'legacy-0.55' : 'unsupported' };
    const monitors = JSON.parse(await execute('hyprctl', ['-j', 'monitors']));
    if (!Array.isArray(monitors)) throw new Error('Invalid monitor inventory');
    report.monitors = monitors.map(monitor => Object.fromEntries(
      ['id', 'name', 'x', 'y', 'width', 'height', 'scale', 'transform', 'focused', 'disabled']
        .filter(key => Object.hasOwn(monitor, key)).map(key => [key, monitor[key]])));
    report.windows = await backend.listWindows();
    report.state = 'observed';
    return report;
  } catch {
    return { ...report, reason: 'Native inventory was incomplete or inaccessible; no acceptance inferred.' };
  }
}

function parseArguments(argv) {
  const options = { platform: process.platform, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--platform' && index + 1 < argv.length) options.platform = argv[++index];
    else if (argument === '--out' && index + 1 < argv.length) options.output = argv[++index];
    else throw new Error(`Unknown or incomplete argument: ${argument}`);
  }
  if (!['win32', 'linux'].includes(options.platform)) throw new Error('Unsupported platform.');
  if (options.platform !== process.platform) throw new Error('Requested platform does not match this host.');
  if (options.output && !path.isAbsolute(options.output)) throw new Error('Evidence output path must be absolute.');
  return options;
}

async function writeExclusive(output, report) {
  await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const report = await capture({ platform: options.platform });
  if (options.output) {
    await writeExclusive(options.output, report);
    process.stdout.write(`${JSON.stringify({ state: report.state, output: options.output })}\n`);
  } else process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.state !== 'observed') process.exitCode = 2;
}

if (require.main === module) main().catch(() => {
  process.stderr.write('Native evidence capture failed.\n');
  process.exitCode = 2;
});

module.exports = { capture, captureWindows, parseArguments, parseWindowsObservation, writeExclusive };
