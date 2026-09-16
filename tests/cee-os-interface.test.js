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
  assert.match(read('README.md'),/Contained Evolution Ecosystem, pronounced “see”/);
  assert.match(read('README.md'),/Shell.*internal compatibility namespace/i);
});

test('activity keeps speedometers around selectable center views',()=>{
  const desktop=read('web/desktop/index.html');
  const layout=read('web/desktop/layout.js');
  const statusBar=read('docs/surfaces/Status-Bar.md');
  for(const section of ['Status','Warnings','Workflows','Permissions','Limits','Priorities'])assert.match(layout,new RegExp(`['\"]${section}['\"]`));
  assert.match(layout,/instrument-board/);
  assert.match(layout,/gauge-rail/);
  assert.match(layout,/Protected Core services/);
  assert.match(desktop,/Active apps and background behavior/);
  assert.match(desktop,/aria-label="Open Core"/);
  assert.match(desktop,/id="backup-core"/);
  assert.match(desktop,/id="checkpoint"/);
  assert.match(statusBar,/fixed center control is the blue ember labeled Core/i);
  assert.doesNotMatch(statusBar,/fixed Home control/);
  for(const policy of ['Rest after','Rest when minimized','Deep sleep later','While its Powerhouse is active','While this computer is on'])assert.match(layout,new RegExp(policy));
  for(const action of ['Pause · fastest reload','Save state · free memory','Save endpoint · end session'])assert.match(layout,new RegExp(action));
  for(const timing of ['2 minutes','5 minutes','15 minutes','30 minutes','1 hour','Never'])assert.match(layout,new RegExp(timing));
  assert.match(layout,/Never sleep any app/);
  assert.match(layout,/two alternating automatic savepoints/);
  assert.match(layout,/Visible does not mean running/);
  assert.match(layout,/Without Core access, an app starts with no knowledge of the user/);
  assert.match(layout,/CEE OS recommends/);
  assert.match(layout,/without promoting this checkpoint to Last Good State/);
});

test('Powerhouse builder exposes assembly, inventory and rolling recovery meaning',()=>{
  const layout=read('web/desktop/layout.js');
  for(const section of ['Build','Inventory','Running','Recovery'])assert.match(layout,new RegExp(`['\"]${section}['\"]`));
  assert.match(layout,/container-conveyor/);
  assert.match(layout,/session start and successful endpoint/);
  assert.match(layout,/user documents remain outside/i);
  const operatingSystem=read('os/README.md');
  assert.match(operatingSystem,/immutable clean Powerhouse source/);
  assert.match(operatingSystem,/last successfully closed state/);
  assert.match(operatingSystem,/quarantined Session Trail/);
  assert.match(operatingSystem,/validates and promotes/);
  assert.match(operatingSystem,/exactly two alternating automatic savepoints/);
  assert.match(operatingSystem,/receives no access to sibling Core data/);
});
