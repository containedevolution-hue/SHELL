'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

async function inspectCamera() {
  try {
    const { stdout, stderr } = await execFileAsync('rpicam-hello', ['--list-cameras'], {
      timeout: 8000,
      maxBuffer: 256 * 1024,
    });
    const output = `${stdout || ''}\n${stderr || ''}`.trim();
    const available = /Available cameras[\s\S]*?\n\s*0\s*:/i.test(output);
    const model = output.match(/^\s*0\s*:\s*([^\[]+)/m)?.[1]?.trim() || null;
    const resolution = output.match(/\[(\d+x\d+)/)?.[1] || null;
    return { available, model, max_resolution: resolution, backend: 'rpicam' };
  } catch (error) {
    return {
      available: false,
      model: null,
      max_resolution: null,
      backend: 'rpicam',
      error: error.code === 'ENOENT' ? 'camera_backend_not_installed' : 'camera_probe_failed',
    };
  }
}

module.exports = {
  name: 'camera_status',
  definition: {
    type: 'function',
    function: {
      name: 'camera_status',
      description: 'Check whether the Command Center camera is connected and ready. This does not capture an image.',
      parameters: { type: 'object', properties: {} },
    },
  },
  execute: inspectCamera,
  inspectCamera,
};
