'use strict';

// MCP tool registry — mirrors the lib/pa-tools.js shape (each tool has
// `name`, `definition` in OpenAI function-call shape, and `execute(args)`)
// so a future adapter on the cloud PA side (A4) can translate appliance MCP
// tools into PA tool-loop entries with one mapping, not per-tool plumbing.
//
// `definition.function.parameters` is JSON Schema, which IS MCP's
// `inputSchema` — listTools() does a structural rename only. No app_access
// or privacy filtering here (lib/pa-tools.js needs it; the appliance does
// not — auth is the network boundary, brought online by A5).

const tools = [
  require('./tools/read-file'),
  require('./tools/list-directory'),
  require('./tools/get-system-status'),
  require('./tools/speak'),
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
