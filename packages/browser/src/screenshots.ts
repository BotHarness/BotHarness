import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function saveScreenshot(
  dir: string,
  limit: number,
  base64: string,
  now: number = Date.now(),
): Promise<string> {
  await mkdir(dir, { recursive: true });
  let stamp = now;
  while (existsSync(join(dir, `screenshot-${stamp}.jpg`))) stamp += 1;
  const file = join(dir, `screenshot-${stamp}.jpg`);
  await writeFile(file, Buffer.from(base64, 'base64'));
  const entries = (await readdir(dir)).filter((name) => name.endsWith('.jpg')).sort();
  const stale = entries.slice(0, Math.max(0, entries.length - Math.max(1, limit)));
  for (const name of stale) {
    await rm(join(dir, name), { force: true }).catch(() => undefined);
  }
  return file;
}
