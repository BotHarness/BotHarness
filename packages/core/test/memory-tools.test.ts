import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import { describe, expect, it } from 'vitest';

import {
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

  it('does not expose a model-settable write source or visibility', () => {
    const write = byName(createMemoryTools({ resolveStore: () => undefined }), 'memory_write');
    expect(Object.keys(write.parameters)).not.toContain('source');
    expect(Object.keys(write.parameters)).not.toContain('visibility');
    expect(Object.keys(write.parameters)).not.toContain('owner');
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
    expect(hits).toEqual([{ path: 'customers/acme.md', line: 9, excerpt: 'Renewal Q4.' }]);
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

    expect(rendered).toEqual([{ type: 'text', text: 'a.md:6: alpha fact' }]);
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
  });

  it('overwrites an existing entry and reports the new body', async () => {
    const root = createTempRoot();
    const store = createMemoryStore({ memoryDir: root, now: FIXED_NOW });
    const tools = createMemoryTools({ resolveStore: () => store });
    const write = byName(tools, 'memory_write');
    const read = byName(tools, 'memory_read');

    await write.execute({ path: 'note.md', body: 'first\n', summary: 'First' }, STUB_EXEC);
    await write.execute({ path: 'note.md', body: 'second\n', summary: 'Second' }, STUB_EXEC);

    expect(await read.execute({ path: 'note.md' }, STUB_EXEC)).toBe('second\n');
    expect(store.history()[0]?.message.split('\n')[0]).toBe('Second');
  });

  it('resolves the store through the memory service for an agent cwd', async () => {
    const root = createTempRoot();
    const workspace = join(root, 'workspace');
    mkdirSync(workspace);
    const registry = createPersonaBotRegistry({ rootDir: join(root, 'bots') });
    registry.create({ slug: 'local-bot', displayName: 'Local Bot', workspaces: [workspace] });
    const service = createMemoryService({ registry, now: FIXED_NOW });
    const tools = createMemoryTools({
      resolveStore: (exec) => service.storeForAgent(exec.agent),
    });
    const exec = {
      agent: { session: { header: { cwd: workspace } } },
    } as unknown as ToolRunContext;

    await byName(tools, 'memory_write').execute(
      { path: 'confidences.md', body: 'tea over coffee\n', summary: 'Preference' },
      exec,
    );

    expect(await byName(tools, 'memory_read').execute({ path: 'confidences.md' }, exec)).toBe(
      'tea over coffee\n',
    );
    expect(String(await byName(tools, 'memory_list').execute({}, exec))).toContain(
      'confidences.md — Preference',
    );
  });
});
