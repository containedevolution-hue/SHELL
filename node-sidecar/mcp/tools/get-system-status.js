'use strict';

const os = require('os');
const fs = require('fs');
const { ROOT } = require('../jail');

module.exports = {
  name: 'get_system_status',
  definition: {
    type: 'function',
    function: {
      name: 'get_system_status',
      description:
        'Return a snapshot of the appliance: hostname, OS, uptime, memory, load, disk free at MCP_ROOT, and sidecar process info. ' +
        'No arguments. Safe to call frequently — read-only, no side effects.',
      parameters: { type: 'object', properties: {} },
    },
  },
  async execute() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const status = {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      uptime_seconds: Math.round(os.uptime()),
      load_avg_1_5_15: os.loadavg().map((n) => Number(n.toFixed(2))),
      cpu_count: os.cpus().length,
      memory: {
        total_bytes: totalMem,
        free_bytes: freeMem,
        used_pct: Math.round(((totalMem - freeMem) / totalMem) * 100),
      },
      sidecar: {
        pid: process.pid,
        node_version: process.version,
        uptime_seconds: Math.round(process.uptime()),
      },
      mcp_root: ROOT,
    };
    // fs.statfs landed in Node 18.15 — graceful skip if unavailable so the
    // tool still works on older runtimes.
    if (typeof fs.statfs === 'function') {
      await new Promise((resolve) => {
        fs.statfs(ROOT, (err, stats) => {
          if (!err && stats) {
            const blockSize = Number(stats.bsize);
            status.disk = {
              free_bytes: Number(stats.bfree) * blockSize,
              total_bytes: Number(stats.blocks) * blockSize,
              used_pct: Math.round(
                ((Number(stats.blocks) - Number(stats.bfree)) / Number(stats.blocks)) * 100
              ),
            };
          }
          resolve();
        });
      });
    }
    return status;
  },
};
