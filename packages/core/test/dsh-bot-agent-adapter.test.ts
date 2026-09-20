import type { Context } from '@deepseek-ai/cordis';
import type {
  Agent,
  AgentHandle,
  CreateAgentOptions,
  ResumeAgentOptions,
} from '@deepseek-ai/dsh-agent';
import { createAssistantMessage, type Message, type UserMessage } from '@deepseek-ai/dsh-llm';
import type { TurnEndReason } from '@deepseek-ai/dsh-session';
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import { describe, expect, it } from 'vitest';

import type { PersonaBotRecord } from '../src/bots/persona-bot.js';
import {
  createDshBotAgentAdapter,
  type DshAgentHost,
} from '../src/runtime/dsh-bot-agent-adapter.js';

const BOT: PersonaBotRecord = {
  slug: 'ada',
  displayName: 'Ada',
  roles: [],
  workspaces: [],
  createdAt: '2026-09-21T00:00:00.000Z',
};

interface FakeScope {
  tools: ToolDefinition[];
  sections: Array<{ name: string; text: string }>;
}

class FakeAgentHost implements DshAgentHost {
  readonly createOptions: CreateAgentOptions[] = [];
  readonly resumeOptions: ResumeAgentOptions[] = [];
  readonly disposed: string[] = [];
  readonly scopes = new Map<string, FakeScope>();

  constructor(private readonly orchestratorTurnEnd: TurnEndReason = { kind: 'completed' }) {}

  async create(options: CreateAgentOptions): Promise<AgentHandle> {
    this.createOptions.push(options);
    return this.#start(String(options.sessionId), options.setup);
  }

  async resume(options: ResumeAgentOptions): Promise<AgentHandle> {
    this.resumeOptions.push(options);
    return this.#start(String(options.resumeSessionId), options.setup);
  }

  async #start(
    sessionId: string,
    setup: CreateAgentOptions['setup'] | ResumeAgentOptions['setup'],
  ): Promise<AgentHandle> {
    const scope: FakeScope = { tools: [], sections: [] };
    const messages: Message[] = [];
    const events: Array<{
      type: 'turn/end';
      seq: number;
      time: number;
      data: { turn: number; reason: TurnEndReason };
    }> = [];
    let pending = Promise.resolve();
    const session = {
      deriveMessages: () => [...messages],
      get seq() {
        return events.length;
      },
      snapshotEvents: (fromSeq = 0, toSeqExclusive = events.length) =>
        events.slice(fromSeq, toSeqExclusive),
    };
    const fakeAgent = {
      id: sessionId,
      session,
      followup: (message: UserMessage) => {
        messages.push(message);
        const isOrchestrator = scope.tools.some((tool) => tool.name === 'create_assignment');
        const reason = isOrchestrator ? this.orchestratorTurnEnd : { kind: 'completed' as const };
        pending = (reason.kind === 'error' ? Promise.resolve() : this.#drive(scope, messages)).then(
          () => {
            events.push({
              type: 'turn/end',
              seq: events.length,
              time: Date.parse(BOT.createdAt),
              data: { turn: events.length + 1, reason },
            });
          },
        );
      },
      whenIdle: () => pending,
    };
    const fakeContext = {
      on: () => () => undefined,
      tools: { register: (tool: ToolDefinition) => void scope.tools.push(tool) },
      systemPrompt: {
        section: (section: { name: string; text: string }) => void scope.sections.push(section),
      },
    };
    await setup?.(fakeContext as unknown as Context, fakeAgent as unknown as Agent);
    this.scopes.set(sessionId, scope);
    return {
      agent: fakeAgent as unknown as Agent,
      dispose: async () => void this.disposed.push(sessionId),
    };
  }

  async #drive(scope: FakeScope, messages: Message[]): Promise<void> {
    const createAssignment = scope.tools.find((tool) => tool.name === 'create_assignment');
    if (createAssignment !== undefined) {
      await createAssignment.execute({ purpose: '核对发布状态' }, {} as ToolRunContext);
      const channelSend = scope.tools.find((tool) => tool.name === 'channel_send');
      await channelSend?.execute({ body: '发布状态已经核对完成。' }, {} as ToolRunContext);
      messages.push(
        createAssistantMessage({
          content: [{ type: 'text', text: 'private Orchestrator final' }],
          source: { provider: 'test', model: 'test' },
        }),
      );
      return;
    }
    const report = scope.tools.find((tool) => tool.name === 'report_to_orchestrator');
    await report?.execute({ state: 'completed', summary: '发布状态正常' }, {} as ToolRunContext);
  }
}

describe('DSH Bot Agent adapter', () => {
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
    expect(host.scopes.get('orchestrator-ada')?.sections[0]?.text).toContain('Orchestrator');
    expect(host.scopes.get('orchestrator-ada')?.sections[0]?.text).toContain('exactly one');
    expect(host.scopes.get('assignment-1')?.sections[0]?.text).toContain('Assignment');

    await adapter.close();
    expect(host.disposed.sort()).toEqual(['assignment-1', 'orchestrator-ada']);
  });
});
