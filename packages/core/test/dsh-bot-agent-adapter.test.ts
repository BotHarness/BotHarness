import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent';
import { SessionId } from '@deepseek-ai/dsh-session';

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

const groupTools = {
  list: () => ({ channels: [] }),
  query: () => ({ messages: [] }),
  createGroup: (): never => {
    throw new Error('unexpected Group creation');
  },
  inviteGroup: (): never => {
    throw new Error('unexpected Group invitation');
  },
  respondToGroupInvite: (): never => {
    throw new Error('unexpected Group response');
  },
  renameGroup: (): never => {
    throw new Error('unexpected Group rename');
  },
  removeGroupMember: (): never => {
    throw new Error('unexpected Group removal');
  },
};

describe('DSH Bot Agent adapter', () => {
  it('borrows a native resumed BotHarness Agent and releases only its role registrations', async () => {
    const host = new FakeAgentHost();
    await host.create({
      sessionId: SessionId('orchestrator-ada'),
      meta: { cwd: '/memory/ada' },
    });
    const native = host.get('orchestrator-ada');
    const authorized: string[] = [];
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => '/memory/ada',
      authorizeBorrow: (agent, role) => authorized.push(role + ':' + agent.session.id),
    });
    await adapter.runOrchestrator({
      sessionId: 'orchestrator-ada',
      resume: true,
      bot: BOT,
      message: '请核对发布状态',
      inboundChannelId: 'dm-test',
      inbox: '',
      channels: {
        ...groupTools,
        contacts: () => [],
        sendToBot: async () => {
          throw new Error('unexpected Bot DM');
        },
        read: () => [],
        search: () => [],
        requestGrant: async (reason) => ({
          id: 'grant-request-1',
          at: BOT.createdAt,
          author: { kind: 'bot', slug: BOT.slug },
          body: reason,
          grantRequest: true,
        }),
        send: async (input) => ({
          id: 'bot-1',
          at: BOT.createdAt,
          author: { kind: 'bot', slug: BOT.slug },
          body: input.body,
        }),
      },
      assignments: {
        create: () => ({ outcome: 'created', assignment: ASSIGNMENT }),
        grants: () => [],
        list: () => [],
        inspect: () => undefined,
        stop: async () => ({
          sessionId: 'test',
          purpose: 'test',
          activity: 'stopped',
          createdAt: '',
          updatedAt: '',
        }),
        request: () => ({ assignment: ASSIGNMENT, delivery: 'followup' }),
      },
    });
    expect(authorized).toEqual(['orchestrator:orchestrator-ada']);
    expect(host.resumeOptions).toHaveLength(0);
    expect(
      host.scopes.get('orchestrator-ada')?.tools.some((tool) => tool.name === 'create_assignment'),
    ).toBe(true);
    await adapter.close();
    expect(host.disposed).toEqual([]);
    expect(host.get('orchestrator-ada')).toBe(native);
    expect(
      host.scopes.get('orchestrator-ada')?.tools.some((tool) => tool.name === 'create_assignment'),
    ).toBe(false);
  });

  it('mounts the resolved agent preset inside every agent factory setup', async () => {
    const host = new FakeAgentHost();
    const mounted: Array<{ id: string | undefined; hasTools: boolean }> = [];
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => '/memory/ada',
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
        ...groupTools,
        contacts: () => [],
        sendToBot: async () => {
          throw new Error('unexpected Bot DM');
        },
        read: () => [],
        search: () => [],
        requestGrant: async (reason) => ({
          id: 'grant-request-1',
          at: BOT.createdAt,
          author: { kind: 'bot', slug: BOT.slug },
          body: reason,
          grantRequest: true,
        }),
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
        grants: () => [],
        list: () => [],
        inspect: () => undefined,
        stop: async () => ({
          sessionId: 'test',
          purpose: 'test',
          activity: 'stopped',
          createdAt: '',
          updatedAt: '',
        }),
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
      orchestratorCwd: () => '/memory/ada',
      defaultAgentPreset: 'standard',
      ensureWorkspace: () => undefined,
    });

    await adapter.runOrchestrator({
      sessionId: 'orchestrator-ada',
      resume: false,
      bot: { ...BOT, preset: 'cordis' },
      message: '你好',
      channels: {
        ...groupTools,
        contacts: () => [],
        sendToBot: async () => {
          throw new Error('unexpected Bot DM');
        },
        read: () => [],
        search: () => [],
        requestGrant: async (reason) => ({
          id: 'grant-request-1',
          at: BOT.createdAt,
          author: { kind: 'bot', slug: BOT.slug },
          body: reason,
          grantRequest: true,
        }),
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
        grants: () => [],
        list: () => [],
        inspect: () => undefined,
        stop: async () => ({
          sessionId: 'test',
          purpose: 'test',
          activity: 'stopped',
          createdAt: '',
          updatedAt: '',
        }),
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
      orchestratorCwd: () => '/memory/ada',
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
        channels: {
          ...groupTools,
          contacts: () => [],
          sendToBot: async () => {
            throw new Error('unexpected Bot DM');
          },
          read: () => [],
          search: () => [],
          requestGrant: async () => undefined as never,
          send: async () => undefined as never,
        },
        assignments: {
          create: () => ({ outcome: 'created', assignment: ASSIGNMENT }),
          grants: () => [],
          list: () => [],
          inspect: () => undefined,
          stop: async () => ({
            sessionId: 'test',
            purpose: 'test',
            activity: 'stopped',
            createdAt: '',
            updatedAt: '',
          }),
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
      orchestratorCwd: () => '/memory/ada',
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
        ...groupTools,
        contacts: () => [],
        sendToBot: async () => {
          throw new Error('unexpected Bot DM');
        },
        read: () => [],
        search: () => [],
        requestGrant: async (reason) => ({
          id: 'grant-request-1',
          at: BOT.createdAt,
          author: { kind: 'bot', slug: BOT.slug },
          body: reason,
          grantRequest: true,
        }),
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
        grants: () => [],
        list: () => [],
        inspect: () => undefined,
        stop: async () => ({
          sessionId: 'test',
          purpose: 'test',
          activity: 'stopped',
          createdAt: '',
          updatedAt: '',
        }),
        request: () => ({ assignment: ASSIGNMENT, delivery: 'followup' }),
      },
    });
    await adapter.runAssignment({
      sessionId: 'assignment-1',
      bot: BOT,
      purpose: '核对发布状态',
      permission: {
        grantId: 'grant-1',
        workspaceId: 'workspace-1',
        primaryCwd: '/project',
        mode: 'workspace-write',
        approval: 'ask',
        presetRevision: 0,
      },
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
      '/memory/ada',
      '/project',
    ]);
    expect(host.createOptions.map((options) => options.meta?.agentPreset)).toEqual([
      'standard',
      'standard',
    ]);
    expect(preparedWorkspaces).toEqual(['/memory/ada']);
    expect(host.scopes.get('orchestrator-ada')?.tools.map((tool) => tool.name)).toEqual([
      'memory_switch_branch',
      'memory_continue_from_commit',
      'create_assignment',
      'request_workspace_grant',
      'list_workspace_grants',
      'list_assignments',
      'inspect_assignment',
      'send_assignment_request',
      'stop_assignment',
      'channel_list',
      'channel_read',
      'channel_read_image',
      'channel_search',
      'list_bot_contacts',
      'group_create',
      'group_invite_bot',
      'group_invite_respond',
      'group_rename',
      'group_remove_member',
      'bot_dm_send',
      'channel_send',
    ]);
    const channelSend = host.scopes
      .get('orchestrator-ada')
      ?.tools.find((tool) => tool.name === 'channel_send');
    expect(channelSend?.parameters).toMatchObject({
      properties: { body: expect.any(Object), channel_id: expect.any(Object) },
      required: ['body'],
    });
    const channelReadImage = host.scopes
      .get('orchestrator-ada')
      ?.tools.find((tool) => tool.name === 'channel_read_image');
    expect(channelReadImage?.parameters).toMatchObject({
      properties: {
        channel_id: expect.any(Object),
        message_id: expect.any(Object),
        hash: expect.any(Object),
      },
      required: ['message_id', 'hash'],
    });
    expect(
      channelReadImage?.output.render(
        {},
        {
          channelId: 'group-team',
          messageId: 'message-1',
          hash: 'sha256:abc',
          image: {
            attachmentId: 'sha256:image',
            mediaType: 'image/png',
            bytes: 8,
            width: 1,
            height: 1,
          },
        },
      ),
    ).toMatchObject([{ type: 'text' }, { type: 'image' }]);
    expect(JSON.stringify(channelSend?.parameters)).not.toMatch(/bot_slug|persona_bot|author/);
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
    expect(assignmentPrompt).toContain('Never access another workspace or the PersonaBot');
    expect(host.scopes.get('orchestrator-ada')?.restrictions).toEqual([]);
    expect(host.scopes.get('assignment-1')?.restrictions).toEqual([]);
    expect(assignmentPrompt).toContain('unless the Human has saved a matching automatic rule');
    expect(assignmentPrompt).toContain('expects_reply');

    await adapter.close();
    expect(host.disposed.sort()).toEqual(['assignment-1', 'orchestrator-ada']);
  });

  it('uses a distinct prompt for a dangerous Assignment snapshot', async () => {
    const host = new FakeAgentHost();
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
    });
    await adapter.runAssignment({
      sessionId: 'assignment-danger',
      bot: BOT,
      purpose: 'Run pwd',
      permission: {
        grantId: 'grant-1',
        workspaceId: 'workspace-1',
        primaryCwd: '/project',
        mode: 'danger-full-access',
        approval: 'never',
        presetRevision: 1,
      },
      report: async (input) => ({ ...input, at: BOT.createdAt }),
    });
    const prompt = host.scopes.get('assignment-danger')?.sections[0]?.text ?? '';
    expect(prompt).toContain('The Human explicitly enabled dangerous full access');
    expect(prompt).toContain('do not ask for each call');
    expect(prompt).not.toContain('require Human approval');
    await adapter.close();
  });

  it('follows up a settled Assignment instead of steering a stale run', async () => {
    const host = new FakeAgentHost();
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
    });
    let reported = false;
    const run = {
      sessionId: 'assignment-1',
      bot: BOT,
      purpose: '核对发布状态',
      permission: {
        grantId: 'grant-1',
        workspaceId: 'workspace-1',
        primaryCwd: '/project',
        mode: 'workspace-write',
        approval: 'ask',
        presetRevision: 0,
      },
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
      orchestratorCwd: () => '/memory/ada',
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
          ...groupTools,
          contacts: () => [],
          sendToBot: async () => {
            throw new Error('unexpected Bot DM');
          },
          read: ({ channelId } = {}) => {
            const id = channelId ?? 'dm-test';
            reads.push(id);
            if (id === 'outside') throw new Error('not a member');
            return [];
          },
          search: () => [],
          requestGrant: async (reason) => ({
            id: 'grant-request-1',
            at: BOT.createdAt,
            author: { kind: 'bot', slug: BOT.slug },
            body: reason,
            grantRequest: true,
          }),
          send: async (input) => ({
            id: 'bot-1',
            at: BOT.createdAt,
            author: { kind: 'bot' as const, slug: BOT.slug },
            body: input.body,
          }),
        },
        assignments: {
          create: () => ({ outcome: 'created', assignment: ASSIGNMENT }),
          grants: () => [],
          list: () => [],
          inspect: () => undefined,
          stop: async () => ({
            sessionId: 'test',
            purpose: 'test',
            activity: 'stopped',
            createdAt: '',
            updatedAt: '',
          }),
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
