// Next 16 static export writes segment data to `<route>/__next.<seg>/__PAGE__.txt`,
// but the client router requests `<route>/__next.<seg>.__PAGE__.txt`. Without a copy
// at the requested path every client navigation 404s and falls back to a full reload.
// Runs after `next build` (npm "postbuild"). Idempotent.
import { readdir, copyFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const out = process.argv[2] || 'out';
let copied = 0;

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('__next.')) {
      for (const file of await readdir(full)) {
        if (!file.endsWith('.txt')) continue;
        const target = join(dir, `${entry.name}.${file}`);
        await copyFile(join(full, file), target);
        copied++;
      }
    }
    if (entry.name !== '_next') await walk(full);
  }
}

await stat(out);
await walk(out);
console.log(`fix-rsc-paths: ${copied} segment file(s) copied`);
