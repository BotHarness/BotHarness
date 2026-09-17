import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createMemoryService, createPersonaBotRegistry } from '../src/index.js';
import { FIXED_NOW, createTempRoot, remember } from './helpers.js';

describe('createMemoryService', () => {
  it('maps an agent cwd to the bot whose workspaces contain it', () => {
    const root = createTempRoot();
    const workspace = join(root, 'ws-a');
    mkdirSync(workspace);
    const registry = createPersonaBotRegistry({ rootDir: join(root, 'bots') });
    registry.create({ slug: 'research', displayName: 'Research', workspaces: [workspace] });
    const service = createMemoryService({ registry });

    const agent = { session: { header: { cwd: workspace } } };
    const store = service.storeForAgent(agent);
    expect(store).toBeDefined();
    expect(store?.memoryDir).toBe(registry.memoryDirFor('research'));
    expect(service.storeForAgent(agent)).toBe(store);
    expect(service.storeForCwd(`${workspace}/`)).toBe(store);
    expect(service.storeForCwd(join(root, 'elsewhere'))).toBeUndefined();
    expect(service.storeForAgent(undefined)).toBeUndefined();
    expect(service.storeForAgent({})).toBeUndefined();
    expect(service.storeForCwd(undefined)).toBeUndefined();
  });

  it('honours a custom memory dir and refuses bots without a workspace match', () => {
    const root = createTempRoot();
    const workspace = join(root, 'ws-b');
    const memoryDir = join(root, 'custom-memory');
    const registry = createPersonaBotRegistry({ rootDir: join(root, 'bots') });
    registry.create({
      slug: 'sales',
      displayName: 'Sales',
      workspaces: [workspace],
      memoryDir,
    });
    const service = createMemoryService({ registry });

    expect(service.storeForCwd(workspace)?.memoryDir).toBe(memoryDir);
    expect(service.storeForCwd(join(root, 'ws-b-nope'))).toBeUndefined();
  });

  it('keeps one store per memory dir so writes stay serialized', async () => {
    const root = createTempRoot();
    const workspace = join(root, 'ws-c');
    mkdirSync(workspace);
    const registry = createPersonaBotRegistry({ rootDir: join(root, 'bots') });
    registry.create({ slug: 'one', displayName: 'One', workspaces: [workspace] });
    const service = createMemoryService({ registry, now: FIXED_NOW });

    const store = service.storeForCwd(workspace);
    expect(store).toBeDefined();
    if (store === undefined) return;
    await remember(store, { path: 'note.md', body: 'hello\n', summary: 'Note' });
    expect(service.storeForCwd(workspace)?.read('note.md')?.body).toBe('hello\n');

    writeFileSync(join(store.memoryDir, 'PERSONA.md'), '# Persona\n\nCalm.\n');
    expect(service.storeForCwd(workspace)?.persona()).toBe('# Persona\n\nCalm.\n');
  });
});
