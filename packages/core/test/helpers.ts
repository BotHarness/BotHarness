import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach } from 'vitest';

import type { MemoryStore, MemoryWriteInput, MemoryWriteResult } from '../src/index.js';
import {
  createSessionOwnership,
  type SessionOwnership,
  type SessionRootRole,
} from '../src/sessions/ownership.js';
import {
  attachOperationalModule,
  mountOperationalDatabase,
  type OperationalDatabaseOwner,
} from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';

const roots: string[] = [];
const owners: OperationalDatabaseOwner[] = [];

export const FIXED_NOW = (): Date => new Date('2026-09-17T00:00:00.000Z');

export function createTempRoot(prefix = 'botharness-test-'): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

export function cleanupTempRoots(): void {
  while (owners.length > 0) owners.pop()?.close();
  while (roots.length > 0) {
    const root = roots.pop();
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  }
}

afterEach(cleanupTempRoots);

export function remember(store: MemoryStore, input: MemoryWriteInput): Promise<MemoryWriteResult> {
  return store.write(input);
}

/** Real ownership module over a throwaway operational database. */
export function createTestOwnership(
  seeded: Record<string, { botSlug: string; rootRole?: SessionRootRole }> = {},
): SessionOwnership {
  const owner = mountOperationalDatabase({
    dshHome: createTempRoot('botharness-test-ownership-'),
    schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
  });
  owners.push(owner);
  const ownership = createSessionOwnership(attachOperationalModule(owner, 'session-ownership'));
  for (const [sessionId, entry] of Object.entries(seeded)) {
    ownership.claim({
      sessionId,
      botSlug: entry.botSlug,
      rootRole: entry.rootRole ?? 'assignment',
      at: '2026-09-19T00:00:00.000Z',
    });
  }
  return ownership;
}
