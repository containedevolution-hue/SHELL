import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NODE_VERSION = 'v24.18.0';

const TARGETS = {
  'win32-x64': { triple: 'x86_64-pc-windows-msvc', url: `https://nodejs.org/dist/${NODE_VERSION}/win-x64/node.exe`, ext: '.exe' },
};

const here = dirname(fileURLToPath(import.meta.url));
const binariesDir = join(here, '..', 'src-tauri', 'binaries');

async function main() {
  const key = `${process.platform}-${process.arch}`;
  const target = TARGETS[key];
  if (!target) {
    console.error(`[fetch-node] no pinned Node for ${key}. v1 supports win32-x64 only (macOS/Linux deferred).`);
    process.exit(1);
  }

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
  const res = await fetch(target.url);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1_000_000) throw new Error(`suspiciously small download (${buf.length} bytes) — aborting`);

  await mkdir(binariesDir, { recursive: true });
  await writeFile(dest, buf);
  console.log(`[fetch-node] wrote ${dest} (${(buf.length / 1e6).toFixed(1)} MB)`);
  console.log('[fetch-node] next: `cd localhub/node-sidecar && npm ci --omit=dev`, then provision whisper/ (see README).');
}

main().catch((e) => {
  console.error(`[fetch-node] ${e.message}`);
  process.exit(1);
});
