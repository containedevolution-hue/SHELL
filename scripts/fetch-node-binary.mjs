import { mkdir, writeFile, stat, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const NODE_VERSION = 'v24.18.0';
const DIST = `https://nodejs.org/dist/${NODE_VERSION}`;

// One pinned Node per Tauri target triple. `app.shell().sidecar("node")` resolves
// `binaries/node-<triple><ext>`. Windows publishes a bare `node.exe`; Linux only
// ships archives, so we pull the tarball and extract the single `bin/node` member.
const TARGETS = {
  'win32-x64': {
    triple: 'x86_64-pc-windows-msvc',
    ext: '.exe',
    url: `${DIST}/win-x64/node.exe`,
    sha256Name: 'win-x64/node.exe',
  },
  'linux-x64': {
    triple: 'x86_64-unknown-linux-gnu',
    ext: '',
    url: `${DIST}/node-${NODE_VERSION}-linux-x64.tar.xz`,
    sha256Name: `node-${NODE_VERSION}-linux-x64.tar.xz`,
    archiveMember: `node-${NODE_VERSION}-linux-x64/bin/node`,
  },
};

const here = dirname(fileURLToPath(import.meta.url));
const binariesDir = join(here, '..', 'src-tauri', 'binaries');

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status} ${res.statusText} (${url})`);
  return Buffer.from(await res.arrayBuffer());
}

// Verify the raw download against the pinned dist SHASUMS256.txt before we trust
// its bytes — this binary is bundled into the shipped installer. `sha256Name` is
// the exact filename column from that file (path-prefixed for per-arch rows).
async function verifyChecksum(buf, sha256Name) {
  const sums = (await download(`${DIST}/SHASUMS256.txt`)).toString('utf8');
  const row = sums.split('\n').map((l) => l.trim().split(/\s+/)).find(([, f]) => f === sha256Name);
  if (!row) throw new Error(`no SHASUMS256 entry for ${sha256Name}`);
  const actual = createHash('sha256').update(buf).digest('hex');
  if (actual !== row[0]) throw new Error(`checksum mismatch for ${sha256Name}: expected ${row[0]}, got ${actual}`);
  console.log(`[fetch-node] sha256 ok: ${sha256Name}`);
}

function extractMember(archiveBuf, member) {
  // Only reached on Linux; GNU/bsd tar both accept -xJOf (xz, member to stdout).
  const tmp = join(binariesDir, `.node-archive-${process.pid}.tar.xz`);
  try {
    execFileSync('tar', ['--version'], { stdio: 'ignore' });
  } catch {
    throw new Error('`tar` is required to unpack the Linux Node archive but was not found');
  }
  return (async () => {
    await writeFile(tmp, archiveBuf);
    try {
      return execFileSync('tar', ['-xJOf', tmp, member], { maxBuffer: 256 * 1024 * 1024 });
    } finally {
      await rm(tmp, { force: true });
    }
  })();
}

async function main() {
  const key = `${process.platform}-${process.arch}`;
  const target = TARGETS[key];
  if (!target) {
    console.error(`[fetch-node] no pinned Node for ${key}. Supported: ${Object.keys(TARGETS).join(', ')}.`);
    process.exit(1);
  }

  await mkdir(binariesDir, { recursive: true });
  const dest = join(binariesDir, `node-${target.triple}${target.ext}`);
  try {
    const s = await stat(dest);
    if (s.size > 0) {
      console.log(`[fetch-node] already present: ${dest} (${(s.size / 1e6).toFixed(1)} MB). Delete it to re-fetch.`);
      return;
    }
  } catch {  }

  console.log(`[fetch-node] downloading Node ${NODE_VERSION} for ${key} …`);
  console.log(`[fetch-node]   ${target.url}`);
  const downloaded = await download(target.url);
  if (downloaded.length < 1_000_000) throw new Error(`suspiciously small download (${downloaded.length} bytes) — aborting`);
  await verifyChecksum(downloaded, target.sha256Name);

  const binary = target.archiveMember ? await extractMember(downloaded, target.archiveMember) : downloaded;
  if (binary.length < 1_000_000) throw new Error(`extracted binary is implausibly small (${binary.length} bytes) — aborting`);

  await writeFile(dest, binary, { mode: 0o755 });
  console.log(`[fetch-node] wrote ${dest} (${(binary.length / 1e6).toFixed(1)} MB)`);
  console.log('[fetch-node] next: `npm --prefix node-sidecar ci --omit=dev`, then provision whisper/ (see README).');
}

main().catch((e) => {
  console.error(`[fetch-node] ${e.message}`);
  process.exit(1);
});
