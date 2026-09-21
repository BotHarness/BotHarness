import { describe, expect, it } from 'vitest';

import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost, FAKE_BOT as BOT } from './dsh-agent-host-fixture.js';

describe('DSH Bot Agent adapter', () => {
  it('mounts the resolved agent preset inside every agent factory setup', async () => {
    const host = new FakeAgentHost();
    const mounted: Array<{ id: string | undefined; hasTools: boolean }> = [];
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      defaultWorkspaceRoot: '/runtime-workspaces',
      defaultAgentPreset: 'standard',
      resolveAgentPresets: () => ({
        mount: async (agentCtx, id) => {
          mounted.push({ id, hasTools: agentCtx.tools !== undefined });
          return undefined;
        },
      }),
      ensureWorkspace: () => undefined,
    });

    await adapter.runOrchestrator({
      sessionId: 'orchestrator-ada',
      resume: false,
      bot: BOT,
      message: '你好',
      channels: {
        read: () => [],
        search: () => [],
        send: async (input) => ({
          id: 'bot-1',
          at: BOT.createdAt,
          author: { kind: 'bot', slug: BOT.slug },
          body: input.body,
        }),
      },
      createAssignment: async () => ({ state: 'completed', summary: 'ok', at: BOT.createdAt }),
    });

    expect(mounted).toEqual([{ id: 'standard', hasTools: true }]);
    await adapter.close();
  });

  it('lets a PersonaBot record choose its own agent preset over the default', async () => {
    const host = new FakeAgentHost();
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      defaultWorkspaceRoot: '/runtime-workspaces',
      defaultAgentPreset: 'standard',
      ensureWorkspace: () => undefined,
    });

    await adapter.runOrchestrator({
      sessionId: 'orchestrator-ada',
      resume: false,
      bot: { ...BOT, preset: 'cordis' },
      message: '你好',
      channels: {
        read: () => [],
        search: () => [],
        send: async (input) => ({
          id: 'bot-1',
          at: BOT.createdAt,
          author: { kind: 'bot', slug: BOT.slug },
          body: input.body,
        }),
      },
      createAssignment: async () => ({ state: 'completed', summary: 'ok', at: BOT.createdAt }),
    });

    expect(host.createOptions[0]?.meta?.agentPreset).toBe('cordis');
    await adapter.close();
  });

  it('rejects when the durable turn outcome is an error even though the Agent becomes idle', async () => {
    const host = new FakeAgentHost({
      kind: 'error',
      error: { code: 'TRANSPORT', message: 'DeepSeek API request failed' },
    });
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      defaultWorkspaceRoot: '/runtime-workspaces',
      ensureWorkspace: () => undefined,
    });

    await expect(
      adapter.runOrchestrator({
        sessionId: 'orchestrator-ada',
        resume: false,
        bot: BOT,
        message: '请核对发布状态',
        channels: { read: () => [], search: () => [], send: async () => undefined as never },
        createAssignment: async () => undefined as never,
      }),
    ).rejects.toThrow(/TRANSPORT.*DeepSeek API request failed/);

    await adapter.close();
  });

  it('runs independent scoped Orchestrator and Assignment roots and owns their handles', async () => {
    const host = new FakeAgentHost();
    const preparedWorkspaces: string[] = [];
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      defaultWorkspaceRoot: '/runtime-workspaces',
      defaultAgentPreset: 'standard',
      ensureWorkspace: (path) => void preparedWorkspaces.push(path),
    });
    const reports: unknown[] = [];
    const sends: unknown[] = [];

    await adapter.runOrchestrator({
      sessionId: 'orchestrator-ada',
      resume: false,
      bot: BOT,
      message: '请核对发布状态',
      channels: {
        read: () => [],
        search: () => [],
        send: async (input) => {
          sends.push(input);
          return {
            id: 'bot-1',
            at: BOT.createdAt,
            author: { kind: 'bot', slug: BOT.slug },
            body: input.body,
          };
        },
      },
      createAssignment: async (purpose) => {
        expect(purpose).toBe('核对发布状态');
        return { state: 'completed', summary: '发布状态正常', at: BOT.createdAt };
      },
    });
    await adapter.runAssignment({
      sessionId: 'assignment-1',
      bot: BOT,
      purpose: '核对发布状态',
      report: async (input) => {
        reports.push(input);
        return { ...input, at: BOT.createdAt };
      },
    });

    expect(sends).toEqual([{ body: '发布状态已经核对完成。' }]);
    expect(reports).toEqual([{ state: 'completed', summary: '发布状态正常' }]);
    expect(host.createOptions).toHaveLength(2);
    expect(host.createOptions.map((options) => options.agentOptions)).toEqual([
      { provider: 'test', model: 'test' },
      { provider: 'test', model: 'test' },
    ]);
    expect(host.createOptions.every((options) => options.parentAgent === undefined)).toBe(true);
    expect(host.createOptions.map((options) => options.meta?.cwd)).toEqual([
      '/runtime-workspaces/ada',
      '/runtime-workspaces/ada',
    ]);
    expect(host.createOptions.map((options) => options.meta?.agentPreset)).toEqual([
      'standard',
      'standard',
    ]);
    expect(preparedWorkspaces).toEqual(['/runtime-workspaces/ada', '/runtime-workspaces/ada']);
    expect(host.scopes.get('orchestrator-ada')?.tools.map((tool) => tool.name)).toEqual([
      'create_assignment',
      'channel_read',
      'channel_search',
      'channel_send',
    ]);
    const channelSend = host.scopes
      .get('orchestrator-ada')
      ?.tools.find((tool) => tool.name === 'channel_send');
    expect(channelSend?.parameters).toMatchObject({
      properties: { body: expect.any(Object), channel_id: expect.any(Object) },
      required: ['body'],
    });
    const channelTools = host.scopes
      .get('orchestrator-ada')
      ?.tools.filter((tool) => tool.name.startsWith('channel_'));
    expect(JSON.stringify(channelTools?.map((tool) => tool.parameters))).not.toMatch(
      /bot_slug|persona_bot|author/,
    );
    expect(host.scopes.get('assignment-1')?.tools.map((tool) => tool.name)).toEqual([
      'report_to_orchestrator',
    ]);
    const orchestratorPrompt = host.scopes.get('orchestrator-ada')?.sections[0]?.text ?? '';
    expect(orchestratorPrompt).toContain('Orchestrator');
    expect(orchestratorPrompt).toContain('channel_send exactly once');
    expect(orchestratorPrompt).toContain('must not be delegated');
    expect(orchestratorPrompt).toContain('Memory Repository');
    const assignmentPrompt = host.scopes.get('assignment-1')?.sections[0]?.text ?? '';
    expect(assignmentPrompt).toContain('Assignment');
    expect(assignmentPrompt).toContain('never write to the PersonaBot');
    expect(assignmentPrompt).toContain('report_to_orchestrator exactly once');

    await adapter.close();
    expect(host.disposed.sort()).toEqual(['assignment-1', 'orchestrator-ada']);
  });
});
