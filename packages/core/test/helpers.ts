import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach } from 'vitest';

import type { MemoryStore, MemoryWriteInput, MemoryWriteOutcome } from '../src/index.js';

const roots: string[] = [];

export const FIXED_NOW = (): Date => new Date('2026-09-17T00:00:00.000Z');

export function createTempRoot(prefix = 'botharness-test-'): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

export function cleanupTempRoots(): void {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  }
}

afterEach(cleanupTempRoots);

export function remember(store: MemoryStore, input: MemoryWriteInput): Promise<MemoryWriteOutcome> {
  return store.write(input);
}
