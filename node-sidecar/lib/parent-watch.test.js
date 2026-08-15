'use strict';

const assert = require('assert');
const { spawn } = require('child_process');
const path = require('path');

const watch = require('./parent-watch');

let failures = 0;
const pending = [];
function check(name, fn) { pending.push([name, fn]); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

check('the watcher stays off when no parent pid is given', () => {
  delete process.env.LOCALHUB_PARENT_PID;
  assert.strictEqual(watch.start(() => {}), null, 'the Pi appliance has no Tauri parent and must not self-exit');
  process.env.LOCALHUB_PARENT_PID = 'not-a-number';
  assert.strictEqual(watch.start(() => {}), null, 'garbage is ignored');
  delete process.env.LOCALHUB_PARENT_PID;
});

check('this process sees itself as alive', () => {
  assert.strictEqual(watch.parentIsAlive(process.pid), true);
});

check('a pid that never existed reads as gone', () => {
  assert.strictEqual(watch.parentIsAlive(2147483646), false);
});

check('a child exits on its own once its parent is killed', async () => {
  const parent = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  await wait(200);

  const childScript = `
    process.env.LOCALHUB_PARENT_PID='${parent.pid}';
    require(${JSON.stringify(path.join(__dirname, 'parent-watch.js'))}).start(function(){ process.exit(7); });
    setInterval(function(){}, 1000);
  `;
  const child = spawn(process.execPath, ['-e', childScript], { stdio: 'ignore' });
  const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));

  await wait(400);
  assert.strictEqual(child.exitCode, null, 'child stays up while the parent lives');

  parent.kill('SIGKILL');
  const code = await Promise.race([exited, wait(8000).then(() => 'timeout')]);
  assert.strictEqual(code, 7, 'child noticed the parent was gone and exited');
});

(async () => {
  for (const [name, fn] of pending) {
    try { await fn(); console.log('  ok   -', name); }
    catch (e) { failures++; console.error('  FAIL -', name, '\n         ', e.stack || e.message); }
  }
  if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
  console.log('\nall parent-watch checks passed');
})();
