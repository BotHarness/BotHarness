import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import { describe, expect, it } from 'vitest';

import {
  GROUP_SCOPE,
  createMemoryService,
  createMemoryStore,
  createMemoryTools,
  createPersonaBotRegistry,
} from '../src/index.js';
import { FIXED_NOW, createTempRoot } from './helpers.js';

const STUB_EXEC = {} as unknown as ToolRunContext;

function byName(tools: ToolDefinition[], name: string): ToolDefinition {
  const tool = tools.find((candidate) => candidate.name === name);
  if (tool === undefined) throw new Error(`tool not found: ${name}`);
  return tool;
}

describe('createMemoryTools', () => {
  it('defines the four memory tools', () => {
    const tools = createMemoryTools({ resolveStore: () => undefined });
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'memory_list',
      'memory_read',
      'memory_search',
      'memory_write',
    ]);
    expect(tools.every((tool) => tool.description.length > 0)).toBe(true);
  });

  it('does not expose a model-settable write source', () => {
    const write = byName(createMemoryTools({ resolveStore: () => undefined }), 'memory_write');
    expect(Object.keys(write.parameters)).not.toContain('source');
    expect(JSON.stringify(write.parameters)).not.toContain('"source"');
  });

  it('throws clear errors when no PersonaBot resolves', async () => {
    const tools = createMemoryTools({ resolveStore: () => undefined });
    const calls: Record<string, Record<string, unknown>> = {
      memory_read: { path: 'a.md' },
      memory_search: { query: 'x' },
      memory_write: { path: 'a.md', body: 'x', summary: 's' },
      memory_list: {},
    };
    for (const tool of tools) {
      await expect(tool.execute(calls[tool.name], STUB_EXEC)).rejects.toThrow(/PersonaBot|session/);
    }
  });

  it('writes, reads, lists and searches through the tools', async () => {
    const root = createTempRoot();
    const store = createMemoryStore({ memoryDir: root, now: FIXED_NOW });
    const tools = createMemoryTools({ resolveStore: () => store });

    const confirmation = await byName(tools, 'memory_write').execute(
      {
        path: 'customers/acme.md',
        body: '# Acme\n\nRenewal Q4.',
        summary: 'Acme profile',
        sources: ['feishu:group-42'],
      },
      STUB_EXEC,
    );
    expect(String(confirmation)).toContain('customers/acme.md');

    const body = await byName(tools, 'memory_read').execute(
      { path: 'customers/acme.md' },
      STUB_EXEC,
    );
    expect(body).toBe('# Acme\n\nRenewal Q4.\n');

    const listed = await byName(tools, 'memory_list').execute({}, STUB_EXEC);
    expect(String(listed)).toContain('customers/acme.md — Acme profile');

    const hits = await byName(tools, 'memory_search').execute({ query: 'renewal' }, STUB_EXEC);
    expect(hits).toEqual([{ path: 'customers/acme.md', line: 10, excerpt: 'Renewal Q4.' }]);
  });

  it('renders search hits as text blocks', async () => {
    const root = createTempRoot();
    const store = createMemoryStore({ memoryDir: root, now: FIXED_NOW });
    const tools = createMemoryTools({ resolveStore: () => store });
    const search = byName(tools, 'memory_search');
    await byName(tools, 'memory_write').execute(
      { path: 'a.md', body: 'alpha fact\n', summary: 'A' },
      STUB_EXEC,
    );

    const value = await search.execute({ query: 'alpha' }, STUB_EXEC);
    const rendered = search.output.render({ query: 'alpha' }, value as never);

    expect(rendered).toEqual([{ type: 'text', text: 'a.md:7: alpha fact' }]);
  });

  it('rejects writes without a summary and hostile paths', async () => {
    const root = createTempRoot();
    const store = createMemoryStore({ memoryDir: root, now: FIXED_NOW });
    const tools = createMemoryTools({ resolveStore: () => store });
    const write = byName(tools, 'memory_write');

    await expect(
      write.execute({ path: 'a.md', body: 'x', summary: ' ' }, STUB_EXEC),
    ).rejects.toThrow(/summary/);
    await expect(
      write.execute({ path: '../evil.md', body: 'x', summary: 's' }, STUB_EXEC),
    ).rejects.toThrow(/escape|relative|reserved/i);
    await expect(
      write.execute({ path: 'a.md', body: 'x', summary: 's', visibility: 'private' }, STUB_EXEC),
    ).rejects.toThrow(/DM|private|owner/);
  });

  it('takes private ownership from the DM scope and hides it from group scopes', async () => {
    const root = createTempRoot();
    const store = createMemoryStore({ memoryDir: root, now: FIXED_NOW });
    const tools = createMemoryTools({
      resolveStore: () => store,
      resolveScope: () => ({ kind: 'dm', owner: 'alice' }),
    });
    const write = byName(tools, 'memory_write');
    const read = byName(tools, 'memory_read');

    await write.execute(
      {
        path: 'secret.md',
        body: 'tea over coffee\n',
        summary: 'Preference',
        visibility: 'private',
      },
      STUB_EXEC,
    );
    expect((await read.execute({ path: 'secret.md' }, STUB_EXEC)) as string).toContain('tea');

    const groupTools = createMemoryTools({ resolveStore: () => store });
    await expect(
      byName(groupTools, 'memory_read').execute({ path: 'secret.md' }, STUB_EXEC),
    ).rejects.toThrow(/not found|no memory file/i);
    await expect(
      byName(groupTools, 'memory_search').execute({ query: 'tea' }, STUB_EXEC),
    ).resolves.toEqual([]);
  });

  it('wires the service DM scope so owner writes land and group reads miss', async () => {
    const root = createTempRoot();
    const workspace = join(root, 'workspace');
    mkdirSync(workspace);
    const registry = createPersonaBotRegistry({ rootDir: join(root, 'bots') });
    registry.create({ slug: 'alice-bot', displayName: 'Alice Bot', workspaces: [workspace] });
    const service = createMemoryService({ registry, now: FIXED_NOW, ownerId: 'alice' });
    const tools = createMemoryTools({
      resolveStore: (exec) => service.storeForAgent(exec.agent),
      resolveScope: (exec) => service.resolveScope(exec),
    });
    const dmExec = {
      agent: { session: { header: { cwd: workspace } } },
    } as unknown as ToolRunContext;

    await byName(tools, 'memory_write').execute(
      {
        path: 'confidences.md',
        body: 'alice prefers tea\n',
        summary: 'Preference',
        visibility: 'private',
      },
      dmExec,
    );

    expect(await byName(tools, 'memory_read').execute({ path: 'confidences.md' }, dmExec)).toBe(
      'alice prefers tea\n',
    );

    const groupTools = createMemoryTools({
      resolveStore: (exec) => service.storeForAgent(exec.agent),
      resolveScope: () => GROUP_SCOPE,
    });
    await expect(
      byName(groupTools, 'memory_read').execute({ path: 'confidences.md' }, dmExec),
    ).rejects.toThrow(/not found|no memory file/i);
  });

  it('surfaces a refused overwrite of another owner private entry', async () => {
    const root = createTempRoot();
    const store = createMemoryStore({ memoryDir: root, now: FIXED_NOW });
    const aliceTools = createMemoryTools({
      resolveStore: () => store,
      resolveScope: () => ({ kind: 'dm', owner: 'alice' }),
    });
    await byName(aliceTools, 'memory_write').execute(
      {
        path: 'secret.md',
        body: 'tea\n',
        summary: 'Preference',
        visibility: 'private',
      },
      STUB_EXEC,
    );

    const groupTools = createMemoryTools({ resolveStore: () => store });
    await expect(
      byName(groupTools, 'memory_write').execute(
        { path: 'secret.md', body: 'leak\n', summary: 'Overwrite' },
        STUB_EXEC,
      ),
    ).rejects.toThrow(/forbidden-private/);
  });
});
