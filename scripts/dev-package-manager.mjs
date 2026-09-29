import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

export function pnpmCommand(
  args,
  {
    platform = process.platform,
    pathDirs = (process.env.PATH ?? process.env.Path ?? '').split(delimiter),
    node = process.execPath,
    exists = existsSync,
  } = {},
) {
  if (platform !== 'win32') return ['pnpm', args];
  const dirs = pathDirs.map((entry) => entry.replace(/^"|"$/g, '')).filter(Boolean);
  for (const dir of dirs) {
    const corepack = join(dir, 'node_modules', 'corepack', 'dist', 'corepack.js');
    if (exists(join(dir, 'corepack.cmd')) && exists(corepack)) {
      return [node, [corepack, 'pnpm', ...args]];
    }
  }
  for (const dir of dirs) {
    if (exists(join(dir, 'pnpm.exe'))) return [join(dir, 'pnpm.exe'), args];
    if (!exists(join(dir, 'pnpm.cmd'))) continue;
    for (const script of [
      join(dir, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
      join(dir, 'node_modules', 'corepack', 'dist', 'pnpm.js'),
    ]) {
      if (exists(script)) return [node, [script, ...args]];
    }
  }
  throw new Error('pnpm was not found on PATH; install Corepack or pnpm before starting DSH');
}
