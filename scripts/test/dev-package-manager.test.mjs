import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { pnpmCommand } from '../dev-package-manager.mjs';

const node = 'test-node';
const pathDirs = ['/other', '/installed'];

function windowsOptions(files) {
  const found = new Set(files);
  return { platform: 'win32', pathDirs, node, exists: (path) => found.has(path) };
}

describe('dev package manager', () => {
  it('uses Corepack found on PATH, even when Node lives elsewhere', () => {
    const corepack = join('/installed', 'node_modules', 'corepack', 'dist', 'corepack.js');
    expect(
      pnpmCommand(['install'], windowsOptions([join('/installed', 'corepack.cmd'), corepack])),
    ).toEqual([node, [corepack, 'pnpm', 'install']]);
  });

  it('uses a standalone pnpm installation when Corepack is absent', () => {
    const pnpm = join('/installed', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs');
    expect(pnpmCommand(['build'], windowsOptions([join('/installed', 'pnpm.cmd'), pnpm]))).toEqual([
      node,
      [pnpm, 'build'],
    ]);
  });

  it('accepts a standalone pnpm executable', () => {
    const pnpm = join('/installed', 'pnpm.exe');
    expect(pnpmCommand(['build'], windowsOptions([pnpm]))).toEqual([pnpm, ['build']]);
  });

  it('reports a missing package manager before attempting to launch DSH', () => {
    expect(() => pnpmCommand(['install'], windowsOptions([]))).toThrow('pnpm was not found');
  });
});
