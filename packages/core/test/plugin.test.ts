import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import type { Context } from '@deepseek-ai/cordis';
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import { describe, expect, it, vi } from 'vitest';

import { apply, inject, name, type PersonaBotRegistry } from '../src/index.js';
import { createTempRoot } from './helpers.js';

interface StubContext {
  tools: { register: ReturnType<typeof vi.fn> };
  systemPrompt: { section: ReturnType<typeof vi.fn> };
  provide: ReturnType<typeof vi.fn>;
}

function createStubContext(): StubContext {
  return {
    tools: { register: vi.fn(() => () => undefined) },
    systemPrompt: { section: vi.fn(() => () => undefined) },
    provide: vi.fn(),
  };
}

describe('plugin entry', () => {
  it('declares its identity', () => {
    expect(name).toBe('botharness-core');
    expect(inject).toEqual(['tools', 'systemPrompt']);
  });

  it('registers nothing when disabled', () => {
    const ctx = createStubContext();

    apply(ctx as unknown as Context, { enabled: false });

    expect(ctx.provide).not.toHaveBeenCalled();
    expect(ctx.tools.register).not.toHaveBeenCalled();
    expect(ctx.systemPrompt.section).not.toHaveBeenCalled();
  });

  it('provides the core and registers memory tools', () => {
    const ctx = createStubContext();

    apply(ctx as unknown as Context, { enabled: true });

    expect(ctx.provide).toHaveBeenCalledTimes(1);
    const [serviceName, service] = ctx.provide.mock.calls[0] ?? [];
    expect(serviceName).toBe('botharness');
    expect(service).toMatchObject({
      rootDir: expect.stringContaining('botharness'),
      registry: expect.anything(),
      states: expect.anything(),
      memory: expect.anything(),
    });
    expect(ctx.tools.register).toHaveBeenCalledTimes(4);
    expect(ctx.tools.register.mock.calls.map((call) => call[0]?.name).sort()).toEqual([
      'memory_list',
      'memory_read',
      'memory_search',
      'memory_write',
    ]);
  });

  it('registers persona and memory-tree prompt sections in order', () => {
    const ctx = createStubContext();

    apply(ctx as unknown as Context, { enabled: true });

    expect(ctx.systemPrompt.section).toHaveBeenCalledTimes(2);
    const sections = ctx.systemPrompt.section.mock.calls.map((call) => call[0]);
    const persona = sections.find((section) => section?.name === 'botharness:persona');
    const tree = sections.find((section) => section?.name === 'botharness:memory-tree');
    expect(persona?.order).toBeLessThan(tree?.order ?? 0);
    expect(tree?.order).toBe(10500);

    expect(persona?.text({})).toBe('');
    expect(tree?.text({})).toBe('');
    expect(persona?.text({ agent: { session: { header: { cwd: '/no/such/workspace' } } } })).toBe(
      '',
    );
    expect(tree?.text({ agent: { session: { header: { cwd: '/no/such/workspace' } } } })).toBe('');
  });

  it('wires the memory store into the registered memory tools and tree section', async () => {
    const home = createTempRoot('botharness-plugin-');
    const workspace = join(home, 'workspace');
    mkdirSync(workspace);
    vi.stubEnv('DSH_HOME', home);
    try {
      const ctx = createStubContext();
      apply(ctx as unknown as Context, { enabled: true });

      const core = ctx.provide.mock.calls[0]?.[1] as { registry: PersonaBotRegistry } | undefined;
      expect(core).toBeDefined();
      core?.registry.create({ slug: 'local-bot', displayName: 'Local', workspaces: [workspace] });

      const tools = ctx.tools.register.mock.calls.map(
        (call) => call[0] as ToolDefinition | undefined,
      );
      const write = tools.find((tool) => tool?.name === 'memory_write');
      const read = tools.find((tool) => tool?.name === 'memory_read');
      expect(write).toBeDefined();
      expect(read).toBeDefined();
      const exec = {
        agent: { session: { header: { cwd: workspace } } },
      } as unknown as ToolRunContext;

      await write?.execute(
        {
          path: 'confidences.md',
          body: 'tea over coffee\n',
          summary: 'Preference',
        },
        exec,
      );
      expect(await read?.execute({ path: 'confidences.md' }, exec)).toBe('tea over coffee\n');

      const sections = ctx.systemPrompt.section.mock.calls.map((call) => call[0]);
      const tree = sections.find((section) => section?.name === 'botharness:memory-tree');
      expect(tree?.text({ agent: exec.agent })).toContain('confidences.md — Preference');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
