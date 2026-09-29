import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { commitMemoryRepositorySeed, createMemoryGit, initializeMemoryGit } from './git.js';

export type MemoryRepositoryFailureCode =
  | 'mkdir-failed'
  | 'git-not-found'
  | 'git-init-failed'
  | 'seed-commit-failed';

export type MemoryRepositoryResult =
  | { ok: true; memoryDir: string; created: boolean }
  | { ok: false; code: MemoryRepositoryFailureCode; message: string };

export interface MemoryRepositoryInspection {
  state: 'ready' | 'missing' | 'invalid';
  head?: string;

  dirty?: boolean;
  detail?: string;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ensureMemoryRepository(options: { memoryDir: string }): MemoryRepositoryResult {
  const memoryDir = options.memoryDir;
  try {
    mkdirSync(memoryDir, { recursive: true });
  } catch (error) {
    return { ok: false, code: 'mkdir-failed', message: messageOf(error) };
  }

  let created: boolean;
  try {
    created = initializeMemoryGit(memoryDir).created;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        ok: false,
        code: 'git-not-found',
        message: 'Git executable is not available on PATH',
      };
    }
    return { ok: false, code: 'git-init-failed', message: messageOf(error) };
  }

  try {
    if (createMemoryGit(memoryDir).head().length === 0) {
      commitMemoryRepositorySeed(memoryDir);
    }
  } catch (error) {
    return { ok: false, code: 'seed-commit-failed', message: messageOf(error) };
  }
  return { ok: true, memoryDir, created };
}

export function inspectMemoryRepository(options: {
  memoryDir: string;
}): MemoryRepositoryInspection {
  const memoryDir = options.memoryDir;
  if (!existsSync(join(memoryDir, '.git'))) return { state: 'missing' };
  try {
    const git = createMemoryGit(memoryDir);
    const head = git.head();
    return {
      state: 'ready',
      ...(head.length === 0 ? {} : { head }),
      dirty: git.status().length > 0,
    };
  } catch (error) {
    return { state: 'invalid', detail: messageOf(error) };
  }
}
