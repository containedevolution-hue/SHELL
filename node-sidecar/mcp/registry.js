'use strict';

const tools = [
  require('./tools/read-file'),
  require('./tools/list-directory'),
  require('./tools/search-files'),
  require('./tools/write-file'),
  require('./tools/create-directory'),
  require('./tools/move-file'),
  require('./tools/move-to-trash'),
  require('./tools/browser-status'),
  require('./tools/browser-tabs'),
  require('./tools/browser-open'),
  require('./tools/browser-read-page'),
  require('./tools/get-system-status'),
  require('./tools/speak'),
  require('./tools/camera-status'),
  require('./tools/camera-snapshot'),
];

const BY_NAME = Object.fromEntries(tools.map((t) => [t.name, t]));

function listTools() {
  return tools.map((t) => ({
    name: t.name,
    description: t.definition.function.description,
    inputSchema: t.definition.function.parameters,
  }));
}

async function executeTool(name, args) {
  const tool = BY_NAME[name];
  if (!tool) return { error: `unknown tool: ${name}` };
  try {
    return await tool.execute(args || {});
  } catch (err) {
    return { error: `tool ${name} threw: ${err.message}` };
  }
}

module.exports = { listTools, executeTool };
