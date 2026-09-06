'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function filesUnder(relativeRoot) {
  const absoluteRoot = path.join(root, relativeRoot);
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, {withFileTypes:true})) {
      const file = path.join(directory,entry.name);
      if (entry.isDirectory() && !['node_modules','target','data','catalog','binaries','gen'].includes(entry.name)) walk(file);
      else if (entry.isFile()) files.push(file);
    }
  }
  walk(absoluteRoot);
  return files;
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

test('the live Shell home discovers local manifests instead of embedding the Tenari catalog', () => {
  const home = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8') + fs.readFileSync(path.join(root,'web','apps.js'),'utf8');
  assert.match(home, /\/v1\/apps/);
  assert.doesNotMatch(home, /app\.tenari\.world|Tenari unreachable|CE_APP_CATALOG/);
});
