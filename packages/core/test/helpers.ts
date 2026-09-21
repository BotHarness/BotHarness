import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach } from 'vitest';

import type { MemoryStore, MemoryWriteInput, MemoryWriteResult } from '../src/index.js';
import {
  SessionOwnershipConflictError,
  SessionOwnershipError,
  type SessionOwnership,
  type SessionOwnershipClaim,
  type SessionOwnershipRecord,
  type SessionRootRole,
} from '../src/sessions/ownership.js';

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

export function remember(store: MemoryStore, input: MemoryWriteInput): Promise<MemoryWriteResult> {
  return store.write(input);
}

/** In-memory ownership double with the same claim/lineage semantics as the real module. */
export function createFakeSessionOwnership(
  owned: Record<string, { botSlug: string; rootRole?: SessionRootRole }> = {},
): SessionOwnership {
  const records = new Map<string, SessionOwnershipRecord>(
    Object.entries(owned).map(([sessionId, entry]) => [
      sessionId,
      {
        sessionId,
        botSlug: entry.botSlug,
        rootRole: entry.rootRole ?? 'assignment',
        provenance: 'created' as const,
        parentSessionId: undefined,
        cwdReference: undefined,
        createdAt: '2026-09-19T00:00:00.000Z',
      },
    ]),
  );

  const claim = (input: SessionOwnershipClaim): SessionOwnershipRecord => {
    const existing = records.get(input.sessionId);
    if (existing !== undefined) {
      if (existing.botSlug === input.botSlug && existing.rootRole === input.rootRole) {
        return existing;
      }
      throw new SessionOwnershipConflictError(input.sessionId, existing, {
        botSlug: input.botSlug,
        rootRole: input.rootRole,
      });
    }
    if (input.parentSessionId !== undefined && !records.has(input.parentSessionId)) {
      throw new SessionOwnershipError(`Unknown parent Session ownership: ${input.parentSessionId}`);
    }
    const record: SessionOwnershipRecord = {
      sessionId: input.sessionId,
      botSlug: input.botSlug,
      rootRole: input.rootRole,
      provenance: input.provenance ?? 'created',
      parentSessionId: input.parentSessionId,
      cwdReference: input.cwdReference,
      createdAt: input.at,
    };
    records.set(record.sessionId, record);
    return record;
  };

  return {
    claim,
    claimWithin: (_connection, input) => claim(input),
    resolve: (sessionId) => records.get(sessionId),
    rootsFor: (botSlug, rootRole) =>
      [...records.values()].filter(
        (record) =>
          record.botSlug === botSlug &&
          record.parentSessionId === undefined &&
          (rootRole === undefined || record.rootRole === rootRole),
      ),
    descendantsOf: (sessionId) => {
      const found: SessionOwnershipRecord[] = [];
      let frontier = [sessionId];
      while (frontier.length > 0) {
        const children = [...records.values()].filter((record) =>
          frontier.includes(record.parentSessionId ?? ''),
        );
        found.push(...children);
        frontier = children.map((record) => record.sessionId);
      }
      return found;
    },
    repair: (input) => {
      const record: SessionOwnershipRecord = {
        sessionId: input.sessionId,
        botSlug: input.botSlug,
        rootRole: input.rootRole,
        provenance: 'repair',
        parentSessionId: records.get(input.sessionId)?.parentSessionId,
        cwdReference: input.cwdReference,
        createdAt: input.at,
      };
      records.set(record.sessionId, record);
      return record;
    },
    list: () => [...records.values()],
  };
}
