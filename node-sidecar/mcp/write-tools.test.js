'use strict';

const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-write-data-'));
process.env.LOCALHUB_DATA_DIR = dataDir;

const allowlist = require('./allowlist');
const writeFile = require('./tools/write-file');
const createDirectory = require('./tools/create-directory');
const moveToTrash = require('./tools/move-to-trash');
const searchFiles = require('./tools/search-files');
const registry = require('./registry');

let failures = 0;
const pending = [];
function check(name, fn) { pending.push([name, fn]); }
const mkdir = (p) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), p)));
const cleanEnv = () => { delete process.env.MCP_ROOT; delete process.env.LOCALHUB_HOST; };

check('every registered tool exposes a name, description and schema', () => {
  const tools = registry.listTools();
  const names = tools.map((t) => t.name);
  for (const expected of ['read_file', 'list_directory', 'search_files', 'write_file', 'create_directory', 'move_to_trash']) {
    assert.ok(names.includes(expected), `${expected} is registered`);
  }
  for (const tool of tools) {
    assert.ok(tool.description && tool.description.length > 10, `${tool.name} describes itself`);
    assert.strictEqual(tool.inputSchema.type, 'object', `${tool.name} takes an object`);
  }
});

check('write_file refuses a folder that was shared for reading only', async () => {
  cleanEnv();
  const shared = mkdir('ce-w-ro-');
  allowlist.save([shared]);
  const res = await writeFile.execute({ path: path.join(shared, 'note.txt'), content: 'hello' });
  assert.ok(res.error, 'refused');
  assert.strictEqual(fs.existsSync(path.join(shared, 'note.txt')), false, 'nothing written');
  allowlist.save([]);
});

check('write_file creates, refuses to clobber, then overwrites and appends', async () => {
  cleanEnv();
  const dir = mkdir('ce-w-rw-');
  allowlist.save([dir]);
  allowlist.allowWrite(dir);
  const target = path.join(dir, 'nested', 'note.txt');

  const created = await writeFile.execute({ path: target, content: 'first' });
  assert.strictEqual(created.error, undefined, 'created without error');
  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'first');

  const clobber = await writeFile.execute({ path: target, content: 'second' });
  assert.ok(clobber.error, 'create mode refuses an existing file');
  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'first', 'content untouched');

  await writeFile.execute({ path: target, content: 'second', mode: 'overwrite' });
  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'second');

  await writeFile.execute({ path: target, content: '-third', mode: 'append' });
  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'second-third');

  allowlist.save([]);
});

check('write_file cannot escape through a junction planted in the approved folder', async () => {
  cleanEnv();
  const dir = mkdir('ce-w-esc-');
  const outside = mkdir('ce-w-out-');
  fs.writeFileSync(path.join(outside, 'target.txt'), 'original');
  allowlist.save([dir]);
  allowlist.allowWrite(dir);
  let linked = true;
  try { fs.symlinkSync(outside, path.join(dir, 'link'), 'junction'); } catch (_) { linked = false; }
  if (linked) {
    const res = await writeFile.execute({ path: path.join(dir, 'link', 'target.txt'), content: 'pwned', mode: 'overwrite' });
    assert.ok(res.error, 'escape refused');
    assert.strictEqual(fs.readFileSync(path.join(outside, 'target.txt'), 'utf8'), 'original', 'outside file untouched');
  }
  allowlist.save([]);
});

check('write_file rejects content over the size limit', async () => {
  cleanEnv();
  const dir = mkdir('ce-w-big-');
  allowlist.save([dir]);
  allowlist.allowWrite(dir);
  const res = await writeFile.execute({ path: path.join(dir, 'big.txt'), content: 'x'.repeat(1024 * 1024 + 1) });
  assert.ok(res.error, 'refused');
  assert.strictEqual(fs.existsSync(path.join(dir, 'big.txt')), false, 'nothing written');
  allowlist.save([]);
});

check('create_directory makes nested folders and is repeatable', async () => {
  cleanEnv();
  const dir = mkdir('ce-w-mkdir-');
  allowlist.save([dir]);
  allowlist.allowWrite(dir);
  const target = path.join(dir, 'a', 'b');
  const first = await createDirectory.execute({ path: target });
  assert.strictEqual(first.created, true);
  assert.ok(fs.statSync(target).isDirectory());
  const second = await createDirectory.execute({ path: target });
  assert.strictEqual(second.error, undefined, 'second call succeeds quietly');
  assert.strictEqual(second.created, false);
  allowlist.save([]);
});

check('move_to_trash preserves the file instead of deleting it', async () => {
  cleanEnv();
  const dir = mkdir('ce-w-trash-');
  allowlist.save([dir]);
  allowlist.allowWrite(dir);
  const target = path.join(dir, 'doomed.txt');
  fs.writeFileSync(target, 'still here');

  const res = await moveToTrash.execute({ path: target });
  assert.strictEqual(res.error, undefined, 'moved without error');
  assert.strictEqual(fs.existsSync(target), false, 'gone from the shared folder');
  assert.strictEqual(fs.readFileSync(res.trash_path, 'utf8'), 'still here', 'contents preserved in trash');
  const origin = JSON.parse(fs.readFileSync(path.join(path.dirname(res.trash_path), 'origin.json'), 'utf8'));
  assert.strictEqual(origin.original_path, target, 'origin recorded for restore');
  allowlist.save([]);
});

check('move_to_trash refuses a read-only shared folder', async () => {
  cleanEnv();
  const dir = mkdir('ce-w-trash-ro-');
  allowlist.save([dir]);
  const target = path.join(dir, 'safe.txt');
  fs.writeFileSync(target, 'safe');
  const res = await moveToTrash.execute({ path: target });
  assert.ok(res.error, 'refused');
  assert.strictEqual(fs.existsSync(target), true, 'file still there');
  allowlist.save([]);
});

check('search_files finds by name and by content, and stays inside the jail', async () => {
  cleanEnv();
  const dir = mkdir('ce-w-search-');
  const outside = mkdir('ce-w-search-out-');
  fs.mkdirSync(path.join(dir, 'sub'));
  fs.writeFileSync(path.join(dir, 'sub', 'recipe-notes.md'), 'sourdough starter');
  fs.writeFileSync(path.join(dir, 'other.md'), 'unrelated');
  fs.writeFileSync(path.join(outside, 'recipe-secret.md'), 'sourdough starter');
  allowlist.save([dir]);

  const byName = await searchFiles.execute({ query: 'recipe' });
  assert.strictEqual(byName.count, 1, 'one name match');
  assert.strictEqual(byName.matches[0].name, 'recipe-notes.md');

  const byContent = await searchFiles.execute({ query: '.md', contains: 'sourdough' });
  assert.strictEqual(byContent.count, 1, 'content filter applied');

  let linked = true;
  try { fs.symlinkSync(outside, path.join(dir, 'link'), 'junction'); } catch (_) { linked = false; }
  if (linked) {
    const afterLink = await searchFiles.execute({ query: 'recipe' });
    assert.strictEqual(afterLink.count, 1, 'junction contents are not searched');
    assert.ok(!afterLink.matches.some((m) => m.name === 'recipe-secret.md'), 'outside file never surfaced');
  }
  allowlist.save([]);
});

(async () => {
  for (const [name, fn] of pending) {
    try { await fn(); console.log('  ok   -', name); }
    catch (e) { failures++; console.error('  FAIL -', name, '\n         ', e.stack || e.message); }
  }
  cleanEnv();
  delete process.env.LOCALHUB_DATA_DIR;
  if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
  console.log('\nall write-tool checks passed');
})();
