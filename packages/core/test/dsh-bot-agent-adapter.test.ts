import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent';

import { describe, expect, it } from 'vitest';

import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost, FAKE_BOT as BOT } from './dsh-agent-host-fixture.js';

const ASSIGNMENT = {
  sessionId: 'assignment-1',
  purpose: '核对发布状态',
  activity: 'working' as const,
  createdAt: '2026-09-17T00:00:00.000Z',
  updatedAt: '2026-09-17T00:00:00.000Z',
};

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
      inboundChannelId: 'dm-test',
      inbox: '',
      assignments: {
        create: () => ({ outcome: 'created', assignment: ASSIGNMENT }),
        list: () => [],
        inspect: () => undefined,
        request: () => ({ assignment: ASSIGNMENT, delivery: 'followup' }),
      },
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
      inboundChannelId: 'dm-test',
      inbox: '',
      assignments: {
        create: () => ({ outcome: 'created', assignment: ASSIGNMENT }),
        list: () => [],
        inspect: () => undefined,
        request: () => ({ assignment: ASSIGNMENT, delivery: 'followup' }),
      },
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
        inboundChannelId: 'dm-test',
        inbox: '',
        message: '请核对发布状态',
        channels: { read: () => [], search: () => [], send: async () => undefined as never },
        assignments: {
          create: () => ({ outcome: 'created', assignment: ASSIGNMENT }),
          list: () => [],
          inspect: () => undefined,
          request: () => ({ assignment: ASSIGNMENT, delivery: 'followup' }),
        },
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
      inboundChannelId: 'dm-test',
      inbox: '',
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
      assignments: {
        create: (input) => {
          expect(input.purpose).toBe('核对发布状态');
          return { outcome: 'created', assignment: ASSIGNMENT };
        },
        list: () => [],
        inspect: () => undefined,
        request: () => ({ assignment: ASSIGNMENT, delivery: 'followup' }),
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
    void reports;

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
      'list_assignments',
      'inspect_assignment',
      'send_assignment_request',
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
    expect(orchestratorPrompt).toContain('does not wait');
    expect(orchestratorPrompt).toContain('must not be delegated');
    expect(orchestratorPrompt).toContain('Memory Repository');
    const assignmentPrompt = host.scopes.get('assignment-1')?.sections[0]?.text ?? '';
    expect(assignmentPrompt).toContain('Assignment');
    expect(assignmentPrompt).toContain('never write to the PersonaBot');
    expect(assignmentPrompt).toContain('expects_reply');

    await adapter.close();
    expect(host.disposed.sort()).toEqual(['assignment-1', 'orchestrator-ada']);
  });

  it('follows up a settled Assignment instead of steering a stale run', async () => {
    const host = new FakeAgentHost();
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      defaultWorkspaceRoot: '/runtime-workspaces',
      ensureWorkspace: () => undefined,
    });
    let reported = false;
    const run = {
      sessionId: 'assignment-1',
      bot: BOT,
      purpose: '核对发布状态',
      report: async (input: { state: string; summary: string }) => {
        reported = true;
        return { ...input, at: BOT.createdAt };
      },
    } as Parameters<typeof adapter.runAssignment>[0];

    const first = adapter.runAssignment(run);
    await Promise.resolve();
    await first;
    expect(reported).toBe(true);

    // A live but settled Agent must be followed up: steering it would leave the
    // caller without a completion signal for the new turn.
    const settled = adapter.requestAssignment(run);
    expect(settled.delivery).toBe('followup');
    if (settled.delivery === 'followup') await settled.done;
    await adapter.close();
  });

  it('caches allowed and denied draft Channels only for the current Orchestrator run', async () => {
    const host = new FakeAgentHost();
    const reads: string[] = [];
    const drafts: string[] = [];
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      defaultWorkspaceRoot: '/runtime-workspaces',
      ensureWorkspace: () => undefined,
      publishDraft: (event) => {
        if (event.type === 'update') drafts.push(event.draft.body);
      },
    });
    const run = (resume: boolean) =>
      adapter.runOrchestrator({
        sessionId: 'orchestrator-ada',
        resume,
        bot: BOT,
        inboundChannelId: 'dm-test',
        inbox: '',
        message: '请核对发布状态',
        channels: {
          read: ({ channelId } = {}) => {
            const id = channelId ?? 'dm-test';
            reads.push(id);
            if (id === 'outside') throw new Error('not a member');
            return [];
          },
          search: () => [],
          send: async (input) => ({
            id: 'bot-1',
            at: BOT.createdAt,
            author: { kind: 'bot' as const, slug: BOT.slug },
            body: input.body,
          }),
        },
        assignments: {
          create: () => ({ outcome: 'created', assignment: ASSIGNMENT }),
          list: () => [],
          inspect: () => undefined,
          request: () => ({ assignment: ASSIGNMENT, delivery: 'followup' }),
        },
      });
    let frameIndex = 0;
    const callIndexes = new Map<string, number>();
    const stream = (callId: string, argumentsDelta: string) => {
      if (!callIndexes.has(callId)) callIndexes.set(callId, callIndexes.size);
      adapter.acceptAssistantStream('orchestrator-ada', {
        type: 'chunk',
        attemptId: 'attempt-1',
        revision: 1,
        index: frameIndex++,
        time: 1,
        chunk: {
          type: 'tool-call-delta',
          index: callIndexes.get(callId),
          id: callId,
          name: 'channel_send',
          argumentsDelta,
        },
      } as AssistantStreamFrame);
    };

    const first = run(false);
    stream('allowed', '{"body":"a');
    stream('allowed', 'b');
    stream('allowed', 'c"}');
    stream('denied-1', '{"body":"private","channel_id":"outside"}');
    stream('denied-2', '{"body":"private","channel_id":"outside"}');
    await first;
    expect(reads).toEqual(['dm-test', 'outside']);
    expect(drafts).toEqual(['a', 'ab', 'abc']);

    const second = run(true);
    frameIndex = 0;
    callIndexes.clear();
    stream('next', '{"body":"next"}');
    await second;
    expect(reads).toEqual(['dm-test', 'outside', 'dm-test']);
    expect(drafts.at(-1)).toBe('next');
    await adapter.close();
  });
});
