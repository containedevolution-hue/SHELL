'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createNativeDeskService } = require('./native-desk-service');

test('shipped service cannot advertise a desk from an empty provider registry', async () => {
  const backend = {
    probe: async () => ({ available: true, compositor: 'Hyprland v0.55.0' }),
    listWindows: async () => [], location: () => 'standalone', describe: () => '', applicationFound: async () => false,
  };
  const service = createNativeDeskService({ backend, acceptancePassed: true, hostId: 'shell-1', hostSessionId: 'session-1',
    slot: { id: 'chat-primary', x: 0, y: 0, width: 800, height: 600, workspace: 'name:chat-lab', holdingWorkspace: 'special:ce-chat-holding', standaloneWorkspace: 'name:chat-standalone' } });
  const snapshot = await service.observe();
  assert.equal(snapshot.deskManager.state, 'unavailable');
  assert.deepEqual(snapshot.clients, []);
});
