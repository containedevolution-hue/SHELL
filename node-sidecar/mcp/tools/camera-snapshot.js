'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { inData } = require('../../lib/paths');
const { inspectCamera } = require('./camera-status');

const execFileAsync = promisify(execFile);
const CAMERA_DIR = inData('camera');
const SNAPSHOT_FILE = path.join(CAMERA_DIR, 'latest.jpg');

module.exports = {
  name: 'camera_snapshot',
  definition: {
    type: 'function',
    function: {
      name: 'camera_snapshot',
      description: 'Capture one current image from the Command Center camera and visually inspect it. Use only when the user explicitly asks to take a picture or asks what the Command Center camera sees.',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: 'Briefly state the user request that authorizes this capture.',
          },
        },
        required: ['reason'],
      },
    },
  },
  async execute(args) {
    const reason = String(args?.reason || '').trim();
    if (!reason) return { error: 'explicit_reason_required' };
    const status = await inspectCamera();
    if (!status.available) return { error: 'camera_unavailable', status };
    await fs.mkdir(CAMERA_DIR, { recursive: true });
    try {
      await execFileAsync('rpicam-still', [
        '--nopreview',
        '--immediate',
        '--timeout', '1',
        '--width', '640',
        '--height', '480',
        '--encoding', 'jpg',
        '--quality', '72',
        '--output', SNAPSHOT_FILE,
      ], { timeout: 15000, maxBuffer: 256 * 1024 });
      const image = await fs.readFile(SNAPSHOT_FILE);
      if (!image.length || image.length > 900000) return { error: 'camera_image_invalid' };
      return {
        ok: true,
        captured_at: new Date().toISOString(),
        mime_type: 'image/jpeg',
        width: 640,
        height: 480,
        image_base64: image.toString('base64'),
      };
    } catch (error) {
      return { error: 'camera_capture_failed', detail: error.message };
    }
  },
};
