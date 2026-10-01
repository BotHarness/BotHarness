import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent';
import { SessionId } from '@deepseek-ai/dsh-session';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';

import { describe, expect, it } from 'vitest';

import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import type { AssignmentAgentRun, OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
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
  readModel: () => JSON.stringify({ messages: [] }),
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
  readGroupWakePolicy: (): never => {
    throw new Error('unexpected Group wake policy read');
  },
  setGroupWakePolicy: (): never => {
    throw new Error('unexpected Group wake policy write');
  },
  leaveGroup: (): never => {
    throw new Error('unexpected Group leave');
  },
};

describe('DSH Bot Agent adapter', () => {
  it('dispatches Group attention Tools only during the owning Orchestrator run', async () => {
    const calls: Array<Promise<unknown>> = [];
    const writes: unknown[] = [];
    const assignmentRequests: unknown[] = [];
    const rejectedSourceCalls: Array<Promise<{ ok: boolean; error?: string }>> = [];
    const current = {
      mode: 'digest' as const,
      count: 5,
      intervalSeconds: 30,
      revision: 0,
      lastActor: null,
      changedAt: null,
    };
    const host = new FakeAgentHost(
      { kind: 'completed' },
      {
        onAgentCreated: () => {
          const tools = host.scopes.get('orchestrator-ada')?.tools ?? [];
          const read = tools.find((tool) => tool.name === 'group_attention_get');
          const write = tools.find((tool) => tool.name === 'group_attention_set');
          if (read === undefined || write === undefined)
            throw new Error('Group Tools not registered');
          calls.push(read.execute({ channel_id: 'group-team' }, {} as ToolRunContext));
          calls.push(
            write.execute({ channel_id: 'group-team', mode: 'mentions' }, {} as ToolRunContext),
          );
          const sourceGet = tools.find((tool) => tool.name === 'source_attention_get');
          const sourceSet = tools.find((tool) => tool.name === 'source_attention_set');
          const sourceReset = tools.find((tool) => tool.name === 'source_attention_reset');
          if (!sourceGet || !sourceSet || !sourceReset)
            throw new Error('Source attention Tools not registered');
          calls.push(sourceGet.execute({}, {} as ToolRunContext));
          calls.push(sourceSet.execute({ wake: 'immediate' }, {} as ToolRunContext));
          calls.push(sourceReset.execute({}, {} as ToolRunContext));
          calls.push(
            sourceSet.execute(
              {
                sourceClass: 'group-ordinary',
                wake: 'digest',
                digestCount: 7,
                digestIntervalSeconds: 45,
              },
              {} as ToolRunContext,
            ),
          );
          calls.push(sourceReset.execute({ sourceClass: 'group-ordinary' }, {} as ToolRunContext));
          const sendAssignment = tools.find((tool) => tool.name === 'send_assignment_request');
          if (sendAssignment === undefined)
            throw new Error('Assignment request Tool not registered');
          calls.push(
            sendAssignment.execute(
              {
                session_id: 'assignment-1',
                text: 'Continue',
                provider: 'deepseek',
                model: 'pro',
                reasoning_effort: 'off',
              },
              {} as ToolRunContext,
            ),
          );
          rejectedSourceCalls.push(
            sendAssignment
              .execute(
                {
                  session_id: 'assignment-1',
                  text: 'Reject',
                  provider: 'deepseek',
                },
                {} as ToolRunContext,
              )
              .then(
                () => ({ ok: true }),
                (error) => ({ ok: false, error: String(error) }),
              ),
          );
          for (const call of [
            sourceSet.execute({ sourceClass: 'human-dm', wake: 'immediate' }, {} as ToolRunContext),
            sourceReset.execute({ sourceClass: 'group-invite' }, {} as ToolRunContext),
          ])
            rejectedSourceCalls.push(
              call.then(
                () => ({ ok: true }),
                (error) => ({ ok: false, error: String(error) }),
              ),
            );
        },
      },
    );
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
    });
    await adapter.runOrchestrator({
      sessionId: 'orchestrator-ada',
      resume: false,
      bot: BOT,
      message: 'Change my Group attention to mentions',
      inboundChannelId: 'dm-test',
      inbox: '',
      sourcePolicy: {
        setImmediateDelivery: (sourceClass, delivery) => ({
          sourceClass,
          delivery,
          admission: 'admit',
          wake: 'immediate',
          revision: 2,
          lastActor: { kind: 'bot', botSlug: 'ada' },
          changedAt: BOT.createdAt,
          overrideActive: true,
          recentWakeCount: 0,
        }),
        resetImmediateDelivery: (sourceClass) => ({
          sourceClass,
          delivery: 'steer',
          admission: 'admit',
          wake: 'immediate',
          revision: 3,
          lastActor: { kind: 'bot', botSlug: 'ada' },
          changedAt: BOT.createdAt,
          overrideActive: false,
          recentWakeCount: 0,
        }),
        list: () => [],
        setAssignmentReport: (wake) => ({
          sourceClass: 'assignment-report',
          admission: 'admit',
          wake,
          delivery: 'steer',
          revision: 2,
          lastActor: { kind: 'bot', botSlug: 'ada' },
          changedAt: BOT.createdAt,
          overrideActive: true,
          recentWakeCount: 0,
        }),
        resetAssignmentReport: () => ({
          sourceClass: 'assignment-report',
          admission: 'admit',
          wake: 'conditional',
          delivery: 'steer',
          revision: 3,
          lastActor: { kind: 'bot', botSlug: 'ada' },
          changedAt: BOT.createdAt,
          overrideActive: false,
          recentWakeCount: 0,
        }),
        setGroupOrdinary: (wake, digestCount, digestIntervalSeconds) => ({
          sourceClass: 'group-ordinary',
          admission: 'admit',
          wake,
          digestCount,
          digestIntervalSeconds,
          delivery: 'steer',
          revision: 2,
          lastActor: { kind: 'bot', botSlug: 'ada' },
          changedAt: BOT.createdAt,
          overrideActive: true,
          recentWakeCount: 0,
        }),
        resetGroupOrdinary: () => ({
          sourceClass: 'group-ordinary',
          admission: 'admit',
          wake: 'digest',
          digestCount: 5,
          digestIntervalSeconds: 30,
          delivery: 'steer',
          revision: 3,
          lastActor: { kind: 'bot', botSlug: 'ada' },
          changedAt: BOT.createdAt,
          overrideActive: false,
          recentWakeCount: 0,
        }),
      },
      channels: {
        ...groupTools,
        readGroupWakePolicy: () => current,
        setGroupWakePolicy: (input) => {
          writes.push(input);
          return {
            ...current,
            mode: input.mode,
            revision: 1,
            lastActor: { kind: 'bot', botSlug: 'ada' },
          };
        },
        contacts: () => ({ outputLimit: 12_000, contacts: [] }),
        sendToBot: async () => {
          throw new Error('unexpected Bot DM');
        },
        ignore: () => ({
          sourceEventId: 'source-1',
          ignoredAt: BOT.createdAt,
          alreadyIgnored: false,
        }),
        read: () => [],
        requestGrant: async () => {
          throw new Error('unexpected Grant request');
        },
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
        stop: async () => ASSIGNMENT,
        request: (input) => {
          assignmentRequests.push(input);
          return {
            assignment: {
              ...ASSIGNMENT,
              ...(input.model === undefined ? {} : { modelRoute: input.model }),
            },
            delivery: 'followup',
          };
        },
      },
    });
    expect((await Promise.all(calls)).map((value) => JSON.parse(String(value)))).toMatchObject([
      { channelId: 'group-team', mode: 'digest', revision: 0 },
      { channelId: 'group-team', mode: 'mentions', revision: 1 },
      { policies: [] },
      { sourceClass: 'assignment-report', wake: 'immediate', revision: 2 },
      { sourceClass: 'assignment-report', wake: 'conditional', revision: 3 },
      {
        sourceClass: 'group-ordinary',
        wake: 'digest',
        digestCount: 7,
        digestIntervalSeconds: 45,
        revision: 2,
      },
      { sourceClass: 'group-ordinary', wake: 'digest', revision: 3 },
      {
        sessionId: 'assignment-1',
        modelRoute: { provider: 'deepseek', model: 'pro', reasoningEffort: 'off' },
      },
    ]);
    expect(writes).toEqual([
      {
        channelId: 'group-team',
        mode: 'mentions',
        count: 5,
        intervalSeconds: 30,
      },
    ]);
    expect(await Promise.all(rejectedSourceCalls)).toEqual([
      {
        ok: false,
        error: expect.stringContaining('provider and model must be specified together'),
      },
      { ok: false, error: expect.stringContaining('Direct sources require delivery') },
      { ok: false, error: expect.stringContaining('must be one of') },
    ]);
    expect(assignmentRequests).toEqual([
      {
        sessionId: 'assignment-1',
        mode: 'next-turn',
        text: 'Continue',
        model: { provider: 'deepseek', model: 'pro', reasoningEffort: 'off' },
      },
    ]);
    const write = host.scopes
      .get('orchestrator-ada')
      ?.tools.find((tool) => tool.name === 'group_attention_set');
    await expect(
      write?.execute({ channel_id: 'group-team', mode: 'all' }, {} as ToolRunContext),
    ).rejects.toThrow('Orchestrator run is unavailable');
    await adapter.close();
  });

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
        contacts: () => ({ outputLimit: 12_000, contacts: [] }),
        sendToBot: async () => {
          throw new Error('unexpected Bot DM');
        },
        ignore: () => ({
          sourceEventId: 'source-1',
          ignoredAt: BOT.createdAt,
          alreadyIgnored: false,
        }),
        read: () => [],
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
        contacts: () => ({ outputLimit: 12_000, contacts: [] }),
        sendToBot: async () => {
          throw new Error('unexpected Bot DM');
        },
        ignore: () => ({
          sourceEventId: 'source-1',
          ignoredAt: BOT.createdAt,
          alreadyIgnored: false,
        }),
        read: () => [],
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

  it.each([undefined, 'MISSING_CREDENTIAL', 'INVALID_CREDENTIAL'])(
    'uses the exact Model Plan route and keeps credential failures repairable: %s',
    async (code) => {
      const host = new FakeAgentHost(
        code === undefined
          ? { kind: 'completed' }
          : {
              kind: 'error',
              error: { code, message: 'selected provider credential unavailable' },
            },
      );
      let available = false;
      const adapter = createDshBotAgentAdapter({
        agents: host,
        hasSession: async () => false,
        prepareModelRoute: async () => {
          if (!available) throw new Error('Model route unavailable; select a Model Preset');
        },
        defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
        orchestratorCwd: () => '/memory/ada',
        defaultAgentPreset: 'standard',
        ensureWorkspace: () => undefined,
      });

      const run: OrchestratorAgentRun = {
        sessionId: 'orchestrator-ada',
        resume: false,
        bot: {
          ...BOT,
          preset: 'cordis',
          modelPlan: {
            revision: 1,
            sourcePresetId: 'preset-1',
            sourcePresetName: 'High intelligence',
            orchestrator: {
              provider: 'deepseek',
              model: 'deepseek-reasoner',
              reasoningEffort: 'high',
            },
            assignmentDefault: { provider: 'deepseek', model: 'deepseek-chat' },
            appliedAt: BOT.createdAt,
          },
        },
        message: '你好',
        channels: {
          ...groupTools,
          contacts: () => ({ outputLimit: 12_000, contacts: [] }),
          sendToBot: async () => {
            throw new Error('unexpected Bot DM');
          },
          ignore: () => ({
            sourceEventId: 'source-1',
            ignoredAt: BOT.createdAt,
            alreadyIgnored: false,
          }),
          read: () => [],
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
      };

      await expect(adapter.runOrchestrator(run)).rejects.toThrow('select a Model Preset');
      expect(host.createOptions).toHaveLength(0);
      available = true;
      if (code === undefined) await adapter.runOrchestrator({ ...run, resume: true });
      else
        await expect(adapter.runOrchestrator({ ...run, resume: true })).rejects.toThrow(
          'Open PersonaBot Profile',
        );
      expect(host.createOptions).toHaveLength(1);
      expect(host.resumeOptions).toHaveLength(0);
      expect(host.createOptions[0]?.meta?.agentPreset).toBe('cordis');
      expect(host.createOptions[0]?.agentOptions).toEqual({
        provider: 'deepseek',
        model: 'deepseek-reasoner',
        reasoningEffort: 'high',
      });
      await adapter.close();
    },
  );

  it('keeps a running Turn on its selected route and uses an edited snapshot on the next Turn', async () => {
    const high = { provider: 'deepseek', model: 'flash', reasoningEffort: 'high' };
    const low = { provider: 'deepseek', model: 'flash', reasoningEffort: 'low' };
    const initialPlan = {
      revision: 1,
      sourcePresetId: 'high',
      sourcePresetName: 'High',
      orchestrator: high,
      assignmentDefault: { provider: 'deepseek', model: 'pro', reasoningEffort: 'off' },
      appliedAt: BOT.createdAt,
    };
    let currentPlan = initialPlan;
    let releaseSend: () => void = () => undefined;
    let reachedSend: () => void = () => undefined;
    const sendGate = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });
    const sendStarted = new Promise<void>((resolve) => {
      reachedSend = resolve;
    });
    let firstSend = true;
    const host = new FakeAgentHost();
    const defaultModel = { currentSelection: () => ({ provider: 'test', model: 'test' }) };
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel,
      resolveModelPlan: () => currentPlan,
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
    });
    const run: OrchestratorAgentRun = {
      sessionId: 'orchestrator-ada',
      resume: false,
      bot: { ...BOT, modelPlan: initialPlan },
      message: 'First turn',
      inbox: '',
      inboundChannelId: 'dm-test',
      channels: {
        ...groupTools,
        contacts: () => ({ outputLimit: 12_000, contacts: [] }),
        sendToBot: async () => {
          throw new Error('unexpected Bot DM');
        },
        ignore: () => ({
          sourceEventId: 'source-1',
          ignoredAt: BOT.createdAt,
          alreadyIgnored: false,
        }),
        read: () => [],
        requestGrant: async () => undefined as never,
        send: async (input) => {
          if (firstSend) {
            firstSend = false;
            reachedSend();
            await sendGate;
          }
          return {
            id: 'bot-1',
            at: BOT.createdAt,
            author: { kind: 'bot', slug: BOT.slug },
            body: input.body,
          };
        },
      },
      assignments: {
        create: () => ({ outcome: 'created', assignment: ASSIGNMENT }),
        grants: () => [],
        list: () => [],
        inspect: () => undefined,
        stop: async () => ASSIGNMENT,
        request: () => ({ assignment: ASSIGNMENT, delivery: 'followup' }),
      },
    };
    try {
      const firstTurn = adapter.runOrchestrator(run);
      await sendStarted;
      expect(await host.selectedModel(run.sessionId)).toMatchObject(high);
      currentPlan = { ...initialPlan, revision: 2, orchestrator: low };
      expect(await host.selectedModel(run.sessionId)).toMatchObject(high);
      releaseSend();
      await firstTurn;

      await adapter.runOrchestrator({ ...run, resume: true, message: 'Next turn' });
      expect(await host.selectedModel(run.sessionId)).toMatchObject(low);
      expect(defaultModel.currentSelection()).toEqual({ provider: 'test', model: 'test' });
    } finally {
      releaseSend();
      await adapter.close();
    }
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
          contacts: () => ({ outputLimit: 12_000, contacts: [] }),
          sendToBot: async () => {
            throw new Error('unexpected Bot DM');
          },
          ignore: () => ({
            sourceEventId: 'source-1',
            ignoredAt: BOT.createdAt,
            alreadyIgnored: false,
          }),
          read: () => [],
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
        contacts: () => ({ outputLimit: 12_000, contacts: [] }),
        sendToBot: async () => {
          throw new Error('unexpected Bot DM');
        },
        ignore: () => ({
          sourceEventId: 'source-1',
          ignoredAt: BOT.createdAt,
          alreadyIgnored: false,
        }),
        read: () => [],
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
      'list_assignment_models',
      'create_assignment',
      'request_workspace_grant',
      'list_workspace_grants',
      'list_assignments',
      'inspect_assignment',
      'send_assignment_request',
      'stop_assignment',
      'channel_list',
      'bridge_read',
      'bridge_attachment_save',
      'bridge_reply_file',
      'bridge_reply',
      'channel_read',
      'inbox_ignore',
      'channel_attachment_open',
      'channel_attachment_save',
      'channel_attachment_import',
      'channel_read_image',
      'list_bot_contacts',
      'group_create',
      'group_invite_bot',
      'group_invite_respond',
      'group_join_request',
      'group_join_decide',
      'group_rename',
      'group_remove_member',
      'group_attention_get',
      'group_attention_set',
      'source_attention_get',
      'source_attention_set',
      'source_attention_reset',
      'group_leave',
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
        attachment_id: expect.any(Object),
      },
      required: ['message_id'],
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
    const groupAttentionSet = host.scopes
      .get('orchestrator-ada')
      ?.tools.find((tool) => tool.name === 'group_attention_set');
    expect(groupAttentionSet?.parameters).toMatchObject({ required: ['channel_id', 'mode'] });
    expect(JSON.stringify(groupAttentionSet?.parameters)).not.toMatch(/bot_slug|persona_bot|actor/);
    expect(host.scopes.get('assignment-1')?.tools.map((tool) => tool.name)).toEqual([
      'report_to_orchestrator',
    ]);
    const orchestratorPrompt = host.scopes.get('orchestrator-ada')?.sections[0]?.text ?? '';
    expect(orchestratorPrompt).toContain('Orchestrator');
    expect(orchestratorPrompt).toContain('does not wait');
    expect(orchestratorPrompt).toContain('must not be delegated');
    expect(orchestratorPrompt).toContain('Memory Repository');
    expect(orchestratorPrompt).toContain('frozen for this Session');
    expect(orchestratorPrompt).toContain('PERSONA.md');
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

  it('passes the persisted Assignment route to its DSH Agent without changing the Bot default', async () => {
    const host = new FakeAgentHost();
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
    });
    const selected: AssignmentAgentRun = {
      sessionId: 'assignment-selected',
      bot: {
        ...BOT,
        modelPlan: {
          revision: 2,
          sourcePresetId: '',
          sourcePresetName: '',
          orchestrator: { provider: 'deepseek', model: 'flash', reasoningEffort: 'high' },
          assignmentDefault: { provider: 'deepseek', model: 'pro', reasoningEffort: 'off' },
          assignmentModels: [
            { provider: 'deepseek', model: 'pro', allowedEfforts: ['off'], defaultEffort: 'off' },
            { provider: 'deepseek', model: 'flash', allowedEfforts: ['low'], defaultEffort: 'low' },
          ],
          appliedAt: BOT.createdAt,
        },
      },
      purpose: 'Inspect',
      modelRoute: { provider: 'deepseek', model: 'flash', reasoningEffort: 'low' },
      permission: {
        grantId: 'grant-1',
        workspaceId: 'workspace-1',
        primaryCwd: '/project',
        mode: 'workspace-write',
        approval: 'ask',
        presetRevision: 0,
      },
      report: async (input) => ({ ...input, at: BOT.createdAt }),
    };
    await adapter.runAssignment(selected);
    expect(host.createOptions[0]?.agentOptions).toEqual({
      provider: 'deepseek',
      model: 'flash',
      reasoningEffort: 'low',
    });
    expect(await host.selectedModel('assignment-selected')).toEqual({
      provider: 'deepseek',
      model: 'flash',
      reasoningEffort: 'low',
    });
    const delivery = adapter.requestAssignment({
      ...selected,
      purpose: 'Continue on Pro',
      resume: true,
      modelRoute: { provider: 'deepseek', model: 'pro', reasoningEffort: 'off' },
    });
    if (delivery.delivery === 'followup') await delivery.done;
    expect(await host.selectedModel('assignment-selected')).toEqual({
      provider: 'deepseek',
      model: 'pro',
      reasoningEffort: 'off',
    });
    await adapter.close();
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

    const settled = adapter.requestAssignment(run);
    expect(settled.delivery).toBe('followup');
    if (settled.delivery === 'followup') await settled.done;
    await adapter.close();
  });

  it('checks draft Channel access without reading messages and caches only for the current run', async () => {
    const host = new FakeAgentHost();
    const probes: string[] = [];
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
          list: ({ channelId }: { channelId?: string } = {}) => {
            const id = channelId ?? 'dm-test';
            probes.push(id);
            return {
              channels:
                id === 'outside'
                  ? []
                  : [
                      {
                        id,
                        name: 'test',
                        type: 'dm' as const,
                        kind: 'human-dm' as const,
                        members: [],
                        humanMembers: [],
                      },
                    ],
            };
          },
          contacts: () => ({ outputLimit: 12_000, contacts: [] }),
          sendToBot: async () => {
            throw new Error('unexpected Bot DM');
          },
          ignore: () => ({
            sourceEventId: 'source-1',
            ignoredAt: BOT.createdAt,
            alreadyIgnored: false,
          }),
          read: () => {
            throw new Error('draft access must not read Channel messages');
          },
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
    expect(probes).toEqual(['dm-test', 'outside']);
    expect(drafts).toEqual(['a', 'ab', 'abc']);

    const second = run(true);
    frameIndex = 0;
    callIndexes.clear();
    stream('next', '{"body":"next"}');
    await second;
    expect(probes).toEqual(['dm-test', 'outside', 'dm-test']);
    expect(drafts.at(-1)).toBe('next');
    await adapter.close();
  });
});

it('routes external Tools through the active owning Orchestrator without a local inbound Channel', async () => {
  const replies: string[][] = [];
  const reads: string[] = [];
  const host = new FakeAgentHost(
    { kind: 'completed' },
    {
      onTurn: async (_session, tools) => {
        const read = tools.find((tool) => tool.name === 'bridge_read');
        const reply = tools.find((tool) => tool.name === 'bridge_reply');
        if (!read || !reply) throw new Error('external tools unavailable');
        expect(reply.parameters).toMatchObject({ required: ['source_event_id', 'text'] });
        await expect(
          read.execute({ source_event_id: 'source-1' }, {} as ToolRunContext),
        ).rejects.toThrow('owned source sentinel');
        const result = await reply.execute(
          { source_event_id: 'source-1', text: 'Topic response' },
          {} as ToolRunContext,
        );
        expect(typeof result).toBe('string');
        if (typeof result !== 'string') throw new Error('Expected serialized tool result');
        expect(JSON.parse(result)).toMatchObject({
          sourceEventId: 'source-1',
          state: 'provider-accepted',
        });
      },
    },
  );
  const adapter = createDshBotAgentAdapter({
    agents: host,
    defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    orchestratorCwd: () => '/memory/ada',
    ensureWorkspace: () => undefined,
  });
  await adapter.runOrchestrator({
    sessionId: 'external-ada',
    resume: false,
    bot: BOT,
    inboundChannelId: undefined,
    inbox: 'External Inbox',
    message: 'External turn',
    externalMessaging: {
      saveFile: async () => {
        throw new Error('file sentinel');
      },
      replyFile: async () => {
        throw new Error('file sentinel');
      },
      read: (id) => {
        reads.push(id);
        throw new Error('owned source sentinel');
      },
      reply: async (id, text) => {
        replies.push([id, text]);
        return {
          id: 'intent',
          botSlug: BOT.slug,
          grantId: 'grant',
          grantRevision: 1,
          sourceEventId: id,
          text,
          state: 'provider-accepted',
          createdAt: BOT.createdAt,
        };
      },
    },
    channels: {
      ...groupTools,
      contacts: () => ({ outputLimit: 12000, contacts: [] }),
      sendToBot: async () => {
        throw new Error('unexpected DM');
      },
      ignore: () => ({
        sourceEventId: 'source-1',
        ignoredAt: BOT.createdAt,
        alreadyIgnored: false,
      }),
      read: () => [],
      requestGrant: async () => undefined as never,
      send: async () => {
        throw new Error('unexpected local message');
      },
    },
    assignments: {
      create: () => ({ outcome: 'created', assignment: ASSIGNMENT }),
      grants: () => [],
      list: () => [],
      inspect: () => undefined,
      stop: async () => ASSIGNMENT,
      request: () => ({ assignment: ASSIGNMENT, delivery: 'followup' }),
    },
  });
  expect(reads).toEqual(['source-1']);
  expect(replies).toEqual([['source-1', 'Topic response']]);
  const tool = host.scopes.get('external-ada')?.tools.find((item) => item.name === 'bridge_reply');
  await expect(
    tool?.execute({ source_event_id: 'source-1', text: 'Late response' }, {} as ToolRunContext),
  ).rejects.toThrow('bridge_reply: unavailable');
  expect(replies).toHaveLength(1);
  await adapter.close();
});
