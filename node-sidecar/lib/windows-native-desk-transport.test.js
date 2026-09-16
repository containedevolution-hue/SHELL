'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { PassThrough } = require('node:stream');
const test = require('node:test');
const { createWindowsBackend } = require('./windows-native-desk');
const { MAX_FRAME, PREFIX, createInheritedWindowsNativeDeskDriver, decode, encode } = require('./windows-native-desk-transport');

const secret = 'a'.repeat(64);
const env = { SHELL_NATIVE_DESK_PIPE: 'enabled', SHELL_NATIVE_DESK_SECRET: secret,
  SHELL_NATIVE_DESK_SESSION: 'session-a', SHELL_NATIVE_DESK_PARENT_PID: '41' };

function harness(handler, options = {}) {
  const input = new PassThrough();
  const output = new PassThrough();
  let text = '';
  output.on('data', chunk => {
    text += chunk.toString('utf8');
    for (;;) {
      const end = text.indexOf('\n');
      if (end < 0) break;
      const line = text.slice(0, end); text = text.slice(end + 1);
      const request = decode(secret, line);
      if (request) handler(request, reply => input.write(encode(secret, { v: 1, sessionId: request.sessionId,
        parentPid: request.parentPid, childPid: request.childPid, requestId: request.requestId,
        nonce: request.nonce, ok: true, result: reply, error: null })));
    }
  });
  return { input, output, port: createInheritedWindowsNativeDeskDriver({ env, input, output, platform: 'win32', parentPid: 41,
    childPid: 42, timeoutMs: options.timeoutMs || 40, randomUUID: options.randomUUID || crypto.randomUUID }) };
}

test('inherited transport refuses absent authority and wrong parent process', () => {
  const input = new PassThrough(); const output = new PassThrough();
  assert.equal(createInheritedWindowsNativeDeskDriver({ env: {}, input, output, platform: 'win32', parentPid: 41 }), null);
  assert.equal(createInheritedWindowsNativeDeskDriver({ env, input, output, platform: 'win32', parentPid: 99 }), null);
  assert.equal(createInheritedWindowsNativeDeskDriver({ env, input, output, platform: 'linux', parentPid: 41 }), null);
});

test('authenticated fake host drives the fixed Windows backend without serializing native identity commands', async () => {
  const seen = [];
  const raw = { clientId: 'chatgpt', windowRef: 'opaque-1', pid: 11, processStartTime: '100', hwnd: '0x11',
    packageFamilyName: 'OpenAI.Codex_x', applicationUserModelId: 'OpenAI.Codex_x!App', packageFullName: 'OpenAI.Codex_1_x64__x',
    packageInstallRoot: 'C:\\Program Files\\WindowsApps\\OpenAI.Codex_1_x64__x',
    processExecutable: 'C:\\Program Files\\WindowsApps\\OpenAI.Codex_1_x64__x\\app\\ChatGPT.exe',
    packageStatus: 'ok', signatureTrusted: true, windowClass: 'Chrome_WidgetWin_1', rootHwnd: '0x11', ownerHwnd: '0x0',
    userWindow: true, visible: true, iconic: false, cloaked: false, elevated: false, onCurrentDesktop: true,
    controllable: true, visualBounds: [10, 20, 800, 700], dpi: 144, focused: false, placement: { show: 'normal' } };
  const h = harness((request, reply) => { seen.push(request); reply(request.op === 'probe' ? { available: true, name: 'private fake' } :
    request.op === 'listWindows' ? [raw] : true); });
  const backend = createWindowsBackend({ platform: 'win32', enabled: true, driver: h.port.driver, driverAccepted: h.port.accepted });
  assert.equal((await backend.probe()).available, true);
  const listed = await backend.listWindows();
  await h.port.driver.applicationFound({ clientId: 'chatgpt' });
  await h.port.driver.place({ clientId: 'chatgpt', hwnd: listed[0].rawHwnd, pid: 11, processStartTime: '100' }, { x: -900, y: 20, width: 800, height: 700 });
  const place = seen.find(value => value.op === 'place');
  assert.deepEqual(place.body, { clientId: 'chatgpt', windowRef: 'opaque-1', rect: { x: -900, y: 20, width: 800, height: 700 } });
  assert.equal(JSON.stringify(place).includes('OpenAI.Codex'), false);
  assert.equal(JSON.stringify(place).includes('0x11'), false);
  h.port.close();
});

test('authenticated channel carries only the fixed Chat observation operation', async()=>{
  const observation={id:'chat',windowLabel:'chat-acceptance'};
  const h=harness((request,reply)=>reply(request.op==='chatObserve'?observation:true));
  assert.deepEqual(await h.port.lifecycle.observe(),observation);
  assert.equal(typeof h.port.lifecycle.open,'undefined');
  h.port.close();
});

test('malformed, unauthenticated, wrong-session and replayed replies are ignored', async () => {
  let request;
  const h = harness((value, reply) => { request = value;
    h.input.write(`${PREFIX}{"payload":"00","mac":"bad"}\n`);
    h.input.write(encode(secret, { v: 1, sessionId: 'wrong', parentPid: 41, childPid: 42, requestId: value.requestId,
      nonce: value.nonce, ok: true, result: { available: false }, error: null }));
    reply({ available: true });
    reply({ available: false });
  });
  assert.equal((await h.port.driver.probe()).available, true);
  assert.ok(request);
  h.port.close();
});

test('oversize frames, timeout, late reply, disconnect and restart fail closed', async () => {
  assert.throws(() => encode(secret, { data: 'x'.repeat(MAX_FRAME) }), /too large/);
  let late;
  const h = harness((request, reply) => { late = () => reply(true); }, { timeoutMs: 10 });
  await assert.rejects(h.port.driver.probe(), /timed out/);
  late();
  h.input.end();
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(h.port.driver.probe(), /unavailable|disconnected/);
  const restarted = harness((_request, reply) => reply({ available: true }));
  assert.notEqual(restarted.port, null);
  restarted.port.close();
});

test('channel errors and logs redact the launch secret', async () => {
  const h = harness((_request, _reply) => {}, { timeoutMs: 5 });
  const error = await h.port.driver.probe().catch(value => value);
  assert.equal(error.message.includes(secret), false);
  h.port.close();
});
