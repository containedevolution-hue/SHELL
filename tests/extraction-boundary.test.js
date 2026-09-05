'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function filesUnder(relativeRoot) {
  const absoluteRoot = path.join(root, relativeRoot);
  return fs.readdirSync(absoluteRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

test('recovered Tenari source is quarantined from SHELL runtime', () => {
  assert.equal(fs.existsSync(path.join(root, 'legacy-tenari')), true);
  for (const area of ['node-sidecar', 'src-tauri', 'web', 'contracts']) {
    for (const file of filesUnder(area)) {
      const source = fs.readFileSync(file, 'utf8');
      assert.doesNotMatch(source, /legacy-tenari[\\/]/, path.relative(root, file));
    }
  }
});

test('Pi installation uses the standalone SHELL repository', () => {
  const readme = fs.readFileSync(path.join(root, 'node-sidecar', 'pi', 'README.md'), 'utf8');
  const setup = fs.readFileSync(path.join(root, 'node-sidecar', 'pi', 'setup.sh'), 'utf8');
  assert.match(readme, /containedevolution-hue\/SHELL/);
  assert.doesNotMatch(readme, /Tenari\/localhub/);
  assert.doesNotMatch(setup, /Tenari\/localhub/);
});
