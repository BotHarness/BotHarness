import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import { describe, expect, it } from 'vitest';

import { createMemoryService, createMemoryTools, createPersonaBotRegistry } from '../src/index.js';
import { FIXED_NOW, createTempRoot } from './helpers.js';

function byName(tools: ToolDefinition[], name: string): ToolDefinition {
  const tool = tools.find((candidate) => candidate.name === name);
  if (tool === undefined) throw new Error(`tool not found: ${name}`);
  return tool;
}

describe('memory across sessions', () => {
  it('lets one session search and read a fact written by another session of the same bot', async () => {
    const root = createTempRoot();
    const workspace = join(root, 'workspace');
    mkdirSync(workspace);
    const registry = createPersonaBotRegistry({ rootDir: join(root, 'bots') });
    registry.create({
      slug: 'research',
      displayName: 'Research',
      workspaces: [workspace],
    });
    const service = createMemoryService({ registry, now: FIXED_NOW });
    const tools = createMemoryTools({
      resolveStore: (exec: ToolRunContext) => service.storeForAgent(exec.agent),
    });

    const sessionA = {
      agent: { session: { header: { cwd: workspace } } },
    } as unknown as ToolRunContext;
    const sessionB = {
      agent: { session: { header: { cwd: workspace } } },
    } as unknown as ToolRunContext;

    await byName(tools, 'memory_write').execute(
      {
        path: 'customers/acme.md',
        body: '# Acme\n\nDecision: renew in Q4.\n',
        summary: 'Acme renewal decision',
        sources: ['feishu:group-42'],
      },
      sessionA,
    );

    const hits = await byName(tools, 'memory_search').execute({ query: 'renew in q4' }, sessionB);
    expect(hits).toEqual([
      { path: 'customers/acme.md', line: 9, excerpt: 'Decision: renew in Q4.' },
    ]);

    const body = await byName(tools, 'memory_read').execute(
      { path: 'customers/acme.md' },
      sessionB,
    );
    expect(body).toBe('# Acme\n\nDecision: renew in Q4.\n');

    const listed = await byName(tools, 'memory_list').execute({}, sessionB);
    expect(String(listed)).toContain('customers/acme.md — Acme renewal decision');
  });
});
