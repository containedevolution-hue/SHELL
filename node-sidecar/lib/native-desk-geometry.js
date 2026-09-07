'use strict';

const { normalizeSlot } = require('./native-desk-manager');

// Native bootstrap supplies layout measurements; manage() never accepts them.
// All output is in compositor logical coordinates, including negative origins.
function resolveNativeDeskSlot({ window, identity, layout, now = Date.now() }) {
  if (!window || !identity || !['pid', 'windowId', 'nativeSessionId', 'processExecutable', 'initialClass'].every(key => window[key] === identity[key])) {
    throw new Error('Chat native window identity changed or is unavailable.');
  }
  if (!layout || layout.contentMatchesWindow !== true || !Number.isSafeInteger(layout.observedAt) || now - layout.observedAt > 1000 || now < layout.observedAt) {
    throw new Error('Trusted Chat geometry is stale or unproven.');
  }
  if (layout.windowId !== window.windowId || layout.nativeSessionId !== window.nativeSessionId ||
      !Array.isArray(layout.compositorSize) || layout.compositorSize.length !== 2 ||
      layout.compositorSize.some((value, index) => value !== window.size?.[index])) throw new Error('Chat layout does not match the current native frame.');
  const { viewport, rect } = layout;
  if (!viewport || !rect || ![viewport.width, viewport.height, rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
      viewport.width <= 0 || viewport.height <= 0 || rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0 ||
      rect.x + rect.width > viewport.width || rect.y + rect.height > viewport.height) throw new Error('Chat slot is outside the trusted content area.');
  if (!Array.isArray(window.at) || !Array.isArray(window.size) || window.at.length !== 2 || window.size.length !== 2 ||
      ![...window.at, ...window.size].every(Number.isSafeInteger) || window.size.some(value => value <= 0)) throw new Error('Invalid Chat compositor geometry.');
  const scale = window.size[0] / viewport.width;
  if (Math.abs(scale - window.size[1] / viewport.height) > 0.000001) throw new Error('Chat viewport and compositor scale disagree.');
  const values = [window.at[0] + rect.x * scale, window.at[1] + rect.y * scale, rect.width * scale, rect.height * scale];
  if (!values.every(Number.isSafeInteger)) throw new Error('Fractional slot edges require a proven rounding policy.');
  // Do not interpolate a title/name from a window into the compositor command.
  if (!Number.isSafeInteger(window.workspaceId) || window.workspaceId < 1) throw new Error('Chat requires an ordinary compositor workspace.');
  return normalizeSlot({ id: 'chat-primary', x: values[0], y: values[1], width: values[2], height: values[3],
    workspace: String(window.workspaceId), holdingWorkspace: 'special:ce-chat-holding', standaloneWorkspace: 'name:ce-chat-standalone' });
}

module.exports = { resolveNativeDeskSlot };
