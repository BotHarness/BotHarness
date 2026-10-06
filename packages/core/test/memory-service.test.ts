import { createTestRegistry } from './registry-fixture.js';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createMemoryService, type MemoryService } from '../src/index.js';
import { ensureMemoryRepository } from '../src/memory/repository.js';
import { createTestOwnership, FIXED_NOW, createTempRoot, remember } from './helpers.js';

function initializeMemory(memoryDir: string) {
  const repository = ensureMemoryRepository({ memoryDir });
  return repository.ok ? { ok: true } : { ok: false, message: repository.code };
}

function setup(options: { memoryDir?: string } = {}): {
  registry: ReturnType<typeof createTestRegistry>;
  ownership: ReturnType<typeof createTestOwnership>;
  service: MemoryService;
} {
  const root = createTempRoot();
  const registry = createTestRegistry({
    rootDir: join(root, 'bots'),
    initializeMemory,
  });
  const ownership = createTestOwnership();
  const created = registry.create({
    slug: 'research',
    displayName: 'Research',
    ...(options.memoryDir === undefined ? {} : { memoryDir: options.memoryDir }),
  });
  expect(created.ok).toBe(true);
  ownership.claim({
    sessionId: 'session-research',
    botSlug: 'research',
    rootRole: 'orchestrator',
    at: FIXED_NOW().toISOString(),
  });
  return {
    registry,
    ownership,
    service: createMemoryService({ registry, ownership, now: FIXED_NOW }),
  };
}

describe('createMemoryService', () => {
  it('resolves a store from explicit Session ownership, never from cwd', () => {
    const { registry, service } = setup();

    const store = service.storeForSession('session-research');
    expect(store).toBeDefined();
    expect(store?.memoryDir).toBe(registry.memoryDirFor('research'));
    expect(service.storeForSession('session-research')).toBe(store);
    expect(service.storeForAgent({ session: { id: 'session-research' } })).toBe(store);
    expect(service.memoryDirFor('session-research')).toBe(registry.memoryDirFor('research'));
    expect(service.repositoryFor('session-research')?.state).toBe('ready');

    expect(service.storeForSession('unowned-session')).toBeUndefined();
    expect(service.storeForSession(undefined)).toBeUndefined();
    expect(service.storeForAgent(undefined)).toBeUndefined();
    expect(service.storeForAgent({})).toBeUndefined();
    expect(service.repositoryFor('unowned-session')).toBeUndefined();
  });

  it('fails closed when the repository is missing instead of pretending Memory works', () => {
    const { registry, service } = setup();
    const memoryDir = registry.memoryDirFor('research');
    if (memoryDir === undefined) throw new Error('memory dir missing');
    rmSync(memoryDir, { recursive: true, force: true });

    expect(service.repositoryFor('session-research')).toEqual({ state: 'missing' });
    expect(service.storeForSession('session-research')).toBeUndefined();
  });

  it('freezes the persona for an existing Session and hands a later edit to new Sessions', () => {
    const { registry, ownership, service } = setup();
    const memoryDir = registry.memoryDirFor('research');
    if (memoryDir === undefined) throw new Error('memory dir missing');
    writeFileSync(join(memoryDir, 'SOUL.md'), '# Persona v1\n');

    const frozen = service.personaForSession('session-research');
    expect(frozen).toContain('## Soul (SOUL.md)');
    expect(frozen).toContain('# Persona v1');
    expect(frozen).toContain('## Core Memory (MEMORY.md)');
    expect(service.personaForSession('session-research')).toBe(frozen);
    expect(ownership.personaSnapshot('session-research')).toEqual({
      body: frozen,
      recordedAt: FIXED_NOW().toISOString(),
    });

    writeFileSync(join(memoryDir, 'SOUL.md'), '# Persona v2\n');
    writeFileSync(join(memoryDir, 'MEMORY.md'), '- grew a lot\n');
    expect(service.personaForSession('session-research')).toBe(frozen);

    ownership.claim({
      sessionId: 'session-second',
      botSlug: 'research',
      rootRole: 'orchestrator',
      at: FIXED_NOW().toISOString(),
    });
    expect(service.personaForSession('session-second')).toContain('# Persona v2');
    expect(service.personaForSession('session-second')).toContain('- grew a lot');

    expect(service.personaForSession('unowned-session')).toBe('');
    expect(service.personaForSession(undefined)).toBe('');
  });

  it('honours a custom memory dir and keeps one store per dir', async () => {
    const root = createTempRoot();
    const memoryDir = join(root, 'custom-memory');
    const { registry, service } = setup({ memoryDir });

    expect(service.storeForSession('session-research')?.memoryDir).toBe(memoryDir);
    const store = service.storeForSession('session-research');
    expect(store).toBeDefined();
    if (store === undefined) return;
    await remember(store, { path: 'note.md', body: 'hello\n', summary: 'Note' });
    expect(service.storeForSession('session-research')?.read('note.md')?.body).toBe('hello\n');
    expect(registry.memoryDirFor('research')).toBe(memoryDir);
  });

  it('refreshes a frozen persona only when the file changed', () => {
    const { registry, service } = setup();
    const memoryDir = registry.memoryDirFor('research');
    if (memoryDir === undefined) throw new Error('memory dir missing');
    writeFileSync(join(memoryDir, 'SOUL.md'), '# Persona v1\n');
    expect(service.personaForSession('session-research')).toContain('# Persona v1');

    writeFileSync(join(memoryDir, 'SOUL.md'), '# Persona v2\n');
    expect(service.personaForSession('session-research')).toContain('# Persona v1');
    expect(service.refreshPersonaAfterCompaction('research', 'session-research')).toEqual({
      refreshed: true,
    });
    expect(service.personaForSession('session-research')).toContain('# Persona v2');
    expect(service.refreshPersonaAfterCompaction('research', 'session-research')).toEqual({
      refreshed: false,
    });

    expect(service.refreshPersonaAfterCompaction('research', 'unowned-session')).toEqual({
      refreshed: false,
    });
    expect(service.refreshPersonaAfterCompaction('other', 'session-research')).toEqual({
      refreshed: false,
    });
  });
});
