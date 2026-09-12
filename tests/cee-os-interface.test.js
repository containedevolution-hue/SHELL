'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('CEE OS is the public name while Shell remains an internal compatibility namespace',()=>{
  assert.match(read('README.md'),/^# CEE OS/m);
  assert.match(read('web/desktop/index.html'),/<title>CEE OS/);
  assert.match(read('web/index.html'),/<title>CEE OS<\/title>/);
  assert.match(read('web/index.html'),/<strong>CEE OS<\/strong>/);
  assert.match(read('README.md'),/Shell.*internal compatibility namespace/i);
});

test('activity keeps speedometers around selectable center views',()=>{
  const layout=read('web/desktop/layout.js');
  for(const section of ['Status','Warnings','Workflows','Permissions','Limits','Priorities'])assert.match(layout,new RegExp(`['\"]${section}['\"]`));
  assert.match(layout,/instrument-board/);
  assert.match(layout,/gauge-rail/);
  assert.match(layout,/Protected Core services/);
});

test('Powerhouse builder exposes assembly, inventory and rolling recovery meaning',()=>{
  const layout=read('web/desktop/layout.js');
  for(const section of ['Build','Inventory','Running','Recovery'])assert.match(layout,new RegExp(`['\"]${section}['\"]`));
  assert.match(layout,/container-conveyor/);
  assert.match(layout,/session start and successful endpoint/);
  assert.match(layout,/user documents remain outside/i);
});
