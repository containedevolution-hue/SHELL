'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const rust = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'native_desk_windows.rs'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'main.rs'), 'utf8');

test('Windows native desk compiles as an internal module with no page-visible command', () => {
  assert.match(main, /#\[cfg\(windows\)\]\s*mod native_desk_windows;/);
  assert.doesNotMatch(rust, /#\[tauri::command\]/);
  const handlers = main.match(/invoke_handler\(tauri::generate_handler!\[([\s\S]*?)\]\)/)?.[1] || '';
  assert.doesNotMatch(handlers, /native_desk|window_(?:place|minimize|restore|focus)|activate_application/i);
  assert.doesNotMatch(rust, /\bpub\s+(?:fn|struct|trait|enum)\b/);
});

test('native driver surface contains no terminate, hidden-window, parenting, input, or arbitrary shell escape', () => {
  for (const prohibited of ['TerminateProcess', 'DestroyWindow', 'WM_CLOSE', 'SW_HIDE', 'SetParent', 'AttachThreadInput', 'SendInput', 'ShellExecute', 'Command::new']) {
    assert.equal(rust.includes(prohibited), false, `${prohibited} must remain outside the driver`);
  }
  const registry = JSON.parse(fs.readFileSync(path.join(root, 'node-sidecar', 'config', 'native-desk-clients.json'), 'utf8'));
  assert.deepEqual(registry.clients, []);
  assert.match(rust, /available:\s*false/);
  assert.match(rust, /transport is not connected/);
});
