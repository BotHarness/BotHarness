import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createMemoryService, createPersonaBotRegistry, type MemoryService } from '../src/index.js';
import { ensureMemoryRepository } from '../src/memory/repository.js';
import { createTestOwnership, FIXED_NOW, createTempRoot, remember } from './helpers.js';

function initializeMemory(memoryDir: string) {
  const repository = ensureMemoryRepository({ memoryDir });
  return repository.ok ? { ok: true } : { ok: false, message: repository.code };
}

function setup(options: { memoryDir?: string } = {}): {
  registry: ReturnType<typeof createPersonaBotRegistry>;
  ownership: ReturnType<typeof createTestOwnership>;
  service: MemoryService;
} {
  const root = createTempRoot();
  const registry = createPersonaBotRegistry({
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
    writeFileSync(join(memoryDir, 'PERSONA.md'), '# Persona v1\n');

    expect(service.personaForSession('session-research')).toBe('# Persona v1\n');
    expect(service.personaForSession('session-research')).toBe('# Persona v1\n');
    expect(ownership.personaSnapshot('session-research')).toEqual({
      body: '# Persona v1\n',
      recordedAt: FIXED_NOW().toISOString(),
    });

    writeFileSync(join(memoryDir, 'PERSONA.md'), '# Persona v2\n');
    expect(service.personaForSession('session-research')).toBe('# Persona v1\n');

    ownership.claim({
      sessionId: 'session-second',
      botSlug: 'research',
      rootRole: 'orchestrator',
      at: FIXED_NOW().toISOString(),
    });
    expect(service.personaForSession('session-second')).toBe('# Persona v2\n');

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
});
