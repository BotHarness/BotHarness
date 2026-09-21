import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createMemoryService, createPersonaBotRegistry } from '../src/index.js';
import { ensureMemoryRepository } from '../src/memory/repository.js';
import { formatMemoryTree } from '../src/memory/tree.js';
import { createTestOwnership, FIXED_NOW, createTempRoot, remember } from './helpers.js';

describe('memory across sessions', () => {
  it('lets one session search and read a fact another session committed', async () => {
    const root = createTempRoot();
    const registry = createPersonaBotRegistry({
      rootDir: join(root, 'bots'),
      initializeMemory: (memoryDir) => {
        const repository = ensureMemoryRepository({ memoryDir });
        return repository.ok ? { ok: true } : { ok: false, message: repository.code };
      },
    });
    expect(registry.create({ slug: 'research', displayName: 'Research' }).ok).toBe(true);
    const ownership = createTestOwnership({
      'session-a': { botSlug: 'research', rootRole: 'orchestrator' },
      'session-b': { botSlug: 'research', rootRole: 'assignment' },
    });
    const service = createMemoryService({ registry, ownership, now: FIXED_NOW });

    const storeA = service.storeForSession('session-a');
    const storeB = service.storeForSession('session-b');
    expect(storeA).toBeDefined();
    expect(storeB).toBe(storeA);

    await remember(storeA!, {
      path: 'customers/acme.md',
      body: '# Acme\n\nDecision: renew in Q4.\n',
      summary: 'Acme renewal decision',
      sources: ['feishu:group-42'],
    });

    expect(await storeB!.search('renew in q4')).toEqual([
      { path: 'customers/acme.md', line: 9, excerpt: 'Decision: renew in Q4.' },
    ]);
    expect(storeB!.read('customers/acme.md')?.body).toBe('# Acme\n\nDecision: renew in Q4.\n');
    expect(formatMemoryTree(storeB!.tree())).toContain('customers/acme.md — Acme renewal decision');
  });
});
