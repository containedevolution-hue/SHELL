'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { capture, parseArguments, parseWindowsObservation } = require('../scripts/capture-chat-native-evidence');

test('evidence collector reports inaccessible Windows and missing Linux sessions unavailable', async () => {
  const windows = await capture({ platform: 'win32', execute: () => { throw new Error('inaccessible'); } });
  const linux = await capture({ platform: 'linux', env: {}, execute: () => { throw new Error('must not run'); } });
  for (const report of [windows, linux]) {
    assert.equal(report.state, 'unavailable');
    assert.equal(report.productionEligible, false);
    assert.deepEqual(report.windows, []);
  }
});

test('Windows evidence records stable package/process/window facts without titles or absolute paths', async () => {
  const calls = [];
  const execute = async (file, args) => {
    calls.push([file, args]);
    return JSON.stringify({
      windows: [{
        clientCandidate: 'chatgpt', packageFamilyName: 'OpenAI.Codex_family',
        applicationUserModelId: 'OpenAI.Codex_family!App', packageFullName: 'OpenAI.Codex_1.0_x64__family',
        relativeExecutable: 'app/ChatGPT.exe', windowClass: 'Chrome_WidgetWin_1', pid: 42,
        processStartTime: '133700000000000000', hwnd: '0x2a', rootSelf: true, ownerAbsent: true,
        visible: true, iconic: false, cloaked: false, toolWindow: false,
        bounds: { x: -1200, y: 20, width: 1000, height: 700 }, dpi: 144,
        title: 'must not survive', processExecutable: 'C:\\private\\ChatGPT.exe',
      }],
      monitors: [{ index: 0, primary: true, bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workingArea: { x: 0, y: 0, width: 1920, height: 1040 }, serial: 'must not survive' }],
    });
  };
  const report = await capture({ platform: 'win32', execute, now: () => 0 });
  assert.equal(report.state, 'observed');
  assert.equal(report.windows[0].relativeExecutable, 'app\\chatgpt.exe');
  assert.equal(report.productionEligible, false);
  assert.equal(report.capabilityComparison, 'not-performed');
  assert.equal(JSON.stringify(report).includes('must not survive'), false);
  assert.equal(JSON.stringify(report).includes('C:\\private'), false);
  assert.equal(calls[0][0], 'powershell.exe');
  assert.deepEqual(calls[0][1].slice(0, 4), ['-NoLogo', '-NoProfile', '-NonInteractive', '-File']);
});

test('Windows evidence parser rejects absolute executables and mismatched AUMIDs', () => {
  const fixture = { windows: [{ clientCandidate: 'claude', packageFamilyName: 'Claude_family',
    applicationUserModelId: 'other!Claude', packageFullName: 'Claude_1.0_x64__family',
    relativeExecutable: 'C:\\Claude.exe', windowClass: 'Class', pid: 1, processStartTime: '1', hwnd: '0x1',
    rootSelf: true, ownerAbsent: true, visible: true, iconic: false, cloaked: false, toolWindow: false,
    bounds: { x: 0, y: 0, width: 800, height: 600 }, dpi: 96 }], monitors: [] };
  assert.throws(() => parseWindowsObservation(JSON.stringify(fixture)), /application identity/);
  fixture.windows[0].applicationUserModelId = 'Claude_family!Claude';
  assert.throws(() => parseWindowsObservation(JSON.stringify(fixture)), /relativeExecutable/);
});

test('CLI evidence output must be private absolute and platform truthful', () => {
  assert.throws(() => parseArguments(['--out', 'relative.json']), /absolute/);
  assert.throws(() => parseArguments(['--unknown']), /Unknown/);
  const native = process.platform === 'win32' ? 'win32' : 'linux';
  const current = parseArguments(['--platform', native, '--out', path.resolve('evidence.json')]);
  assert.equal(path.isAbsolute(current.output), true);
  assert.throws(() => parseArguments(['--platform', native === 'win32' ? 'linux' : 'win32']), /does not match/);
});

test('Windows collector remains read-only and excludes sensitive descriptive fields', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'capture-chat-native-evidence-windows.ps1'), 'utf8');
  for (const prohibited of ['SetWindowPos', 'SetForegroundWindow', 'ShowWindow', 'DestroyWindow', 'TerminateProcess',
    'GetWindowText', 'MainWindowTitle', 'CommandLine', 'Environment', 'DeviceName', 'SerialNumber']) {
    assert.equal(source.includes(prohibited), false, `${prohibited} must remain outside evidence discovery`);
  }
  assert.match(source, /GetApplicationUserModelId/);
  assert.match(source, /GetPackageFamilyName/);
  assert.match(source, /GetClassName/);
});

test('Linux evidence records actual returned identities and excludes monitor serials', async () => {
  const calls = [];
  const execute = async (_file, args) => {
    calls.push(args);
    return JSON.stringify(args.includes('version') ? { tag: 'v0.55.1', commit: 'fixture' }
      : [{ id: 1, name: 'fixture', width: 1920, serial: 'private', description: 'private' }]);
  };
  const report = await capture({ platform: 'linux', env: { HYPRLAND_INSTANCE_SIGNATURE: 'fixture' }, execute,
    backend: { listWindows: async () => [{ windowId: '0x1', processExecutable: '/fixture/app',
      initialClass: 'ActualReturnedClass', nativeSessionId: 'process-fixture' }] } });
  assert.equal(report.state, 'observed');
  assert.equal(report.windows[0].initialClass, 'ActualReturnedClass');
  assert.equal(report.productionEligible, false);
  assert.equal(report.capabilityComparison, 'not-performed');
  assert.equal(JSON.stringify(report).includes('private'), false);
  assert.deepEqual(calls, [['-j', 'version'], ['-j', 'monitors']]);
});

test('failed Linux evidence capture is incomplete and never qualifies an installation', async () => {
  const report = await capture({ platform: 'linux', env: { HYPRLAND_INSTANCE_SIGNATURE: 'fixture' },
    execute: async () => { throw new Error('no permission'); } });
  assert.equal(report.state, 'unavailable');
  assert.equal(report.productionEligible, false);
});
