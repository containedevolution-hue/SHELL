'use strict';

// Append-only local audit log of what the assistant read from the machine.
// One JSON line per event in <dataDir>/mcp-audit.log — a trust/receipt surface
// the user can inspect, not a tamper-proof control (it lives on the same box).
// Best-effort: a logging failure never blocks or fails a tool.

const fs = require('fs');
const { inData } = require('../lib/paths');

function record(event) {
  try {
    fs.appendFileSync(inData('mcp-audit.log'), JSON.stringify({ t: new Date().toISOString(), ...event }) + '\n');
  } catch (_) { /* never block a tool on audit */ }
}

module.exports = { record };
