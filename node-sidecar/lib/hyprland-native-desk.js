'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const ADDRESS = /^0x[0-9a-f]+$/i;

async function defaultRun(file, args, options = {}) {
  const result = await execFileAsync(file, args, { timeout: 3000, maxBuffer: 1024 * 1024, windowsHide: true, ...options });
  return String(result.stdout || '').trim();
}

function processStartTime(pid, readFile = fs.promises.readFile) {
  return readFile(`/proc/${pid}/stat`, 'utf8').then(raw => {
    const end = raw.lastIndexOf(')');
    const fields = raw.slice(end + 2).trim().split(/\s+/);
    if (end < 0 || !fields[19]) throw new Error('Process start time unavailable.');
    return fields[19];
  });
}

function sessionId(pid, startTime, executable) {
  const digest = crypto.createHash('sha256').update(`${pid}\0${startTime}\0${executable}`).digest('hex').slice(0, 24);
  return `process-${pid}-${digest}`;
}

function workspaceName(window) {
  return typeof window.workspace?.name === 'string' ? window.workspace.name : '';
}

function createHyprlandBackend({
  platform = process.platform,
  env = process.env,
  enabled = env.SHELL_CHAT_NATIVE_DESK === 'enabled',
  dialect = env.SHELL_HYPRLAND_DIALECT,
  run = defaultRun,
  spawnProcess = spawn,
  readlink = fs.promises.readlink,
  readFile = fs.promises.readFile,
  access = fs.promises.access,
  waitMs = 5000,
  pollMs = 100,
} = {}) {
  const supported = dialect === 'legacy-0.55';

  async function probe() {
    if (!enabled) return { available: false, compositor: 'Hyprland disabled' };
    if (platform !== 'linux' || !env.HYPRLAND_INSTANCE_SIGNATURE) return { available: false, compositor: 'Hyprland unavailable' };
    if (!supported) return { available: false, compositor: 'Hyprland command dialect unverified' };
    try {
      const version = JSON.parse(await run('hyprctl', ['-j', 'version']));
      const versionLabel = String(version.tag || version.version || '');
      if (!/^v?0\.55\./.test(versionLabel)) return { available: false, compositor: `Hyprland ${versionLabel || 'version unknown'} is outside the verified command profile` };
      JSON.parse(await run('hyprctl', ['-j', 'clients']));
      return { available: true, compositor: `Hyprland ${versionLabel}` };
    } catch {
      return { available: false, compositor: 'Hyprland control unavailable' };
    }
  }

  async function listWindows() {
    const clients = JSON.parse(await run('hyprctl', ['-j', 'clients']));
    if (!Array.isArray(clients)) throw new Error('Invalid Hyprland client inventory.');
    const result = [];
    for (const client of clients) {
      const pid = Number(client.pid);
      const address = String(client.address || '');
      if (!Number.isSafeInteger(pid) || pid < 1 || !ADDRESS.test(address) || typeof client.initialClass !== 'string') continue;
      try {
        const before = await processStartTime(pid, readFile);
        const executable = await readlink(`/proc/${pid}/exe`);
        const startTime = await processStartTime(pid, readFile);
        if (before !== startTime) continue;
        result.push({
          pid,
          windowId: address.toLowerCase(),
          nativeSessionId: sessionId(pid, startTime, executable),
          processExecutable: executable,
          initialClass: client.initialClass,
          workspace: workspaceName(client),
          workspaceId: client.workspace?.id,
          at: Array.isArray(client.at) ? client.at.map(Number) : [],
          size: Array.isArray(client.size) ? client.size.map(Number) : [],
          floating: Boolean(client.floating),
        });
      } catch {
        // A process may exit between compositor inventory and /proc inspection.
      }
    }
    return result;
  }

  function selector(window) {
    if (!ADDRESS.test(window?.windowId || '')) throw new Error('Invalid Hyprland window address.');
    return `address:${window.windowId}`;
  }

  function location(window, slot) {
    if (window.workspace === slot.holdingWorkspace) return 'parked';
    const inWorkspace = slot.workspace.startsWith('name:') ? window.workspace === slot.workspace.slice(5) : String(window.workspaceId) === slot.workspace;
    if (inWorkspace && window.floating && window.at[0] === slot.x && window.at[1] === slot.y && window.size[0] === slot.width && window.size[1] === slot.height) return 'attached';
    return 'standalone';
  }

  async function batch(commands) {
    if (!commands.length) return;
    const output = await run('hyprctl', ['--batch', commands.join(' ; ')]);
    const replies = output.split(/\r?\n/).filter(Boolean);
    if (replies.some(reply => reply.trim() !== 'ok')) throw new Error('Hyprland rejected a native desk command.');
  }

  function parkCommand(window, slot) {
    return `dispatch movetoworkspacesilent ${slot.holdingWorkspace},${selector(window)}`;
  }

  async function switchWindows({ park, target, slot }) {
    const targetSelector = selector(target);
    const commands = [];
    if (park) commands.push(parkCommand(park, slot));
    commands.push(
      `dispatch setfloating ${targetSelector}`,
      `dispatch movetoworkspacesilent ${slot.workspace},${targetSelector}`,
      `dispatch resizewindowpixel exact ${slot.width} ${slot.height},${targetSelector}`,
      `dispatch movewindowpixel exact ${slot.x} ${slot.y},${targetSelector}`,
      `dispatch focuswindow ${targetSelector}`,
    );
    await batch(commands);
  }

  async function park(window, slot) {
    await batch([parkCommand(window, slot)]);
  }

  async function openStandalone(window, slot) {
    const target = selector(window);
    await batch([
      `dispatch movetoworkspacesilent ${slot.standaloneWorkspace},${target}`,
      `dispatch focuswindow ${target}`,
    ]);
  }

  async function applicationFound(entry) {
    try { await access(entry.executable, fs.constants.X_OK); return true; }
    catch { return false; }
  }

  async function launch(entry) {
    if (!await applicationFound(entry)) throw new Error('Registered native executable is missing or not executable.');
    const child = spawnProcess(entry.executable, [...entry.args], { detached: true, shell: false, stdio: 'ignore' });
    await new Promise((resolve, reject) => { child.once('error', reject); child.once('spawn', resolve); });
    child.unref?.();
  }

  async function waitForWindow(entry, predicate) {
    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline) {
      const found = (await listWindows()).filter(predicate);
      if (found.length === 1) return found[0];
      if (found.length > 1) throw new Error(`Multiple windows appeared for ${entry.clientId}.`);
      await new Promise(resolve => setTimeout(resolve, pollMs));
    }
    throw new Error(`Timed out waiting for ${entry.clientId}.`);
  }

  function describe(window, state) {
    if (state === 'attached') return 'Verified native window occupies the Chat slot.';
    if (state === 'parked') return 'Verified native window is running on the Chat holding workspace.';
    return 'Verified native window is running separately.';
  }

  return Object.freeze({ probe, listWindows, location, describe, switch: switchWindows, park, openStandalone, applicationFound, launch, waitForWindow });
}

module.exports = { createHyprlandBackend, processStartTime, sessionId };
