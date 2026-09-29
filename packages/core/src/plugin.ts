import { join } from 'node:path';

import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-session';
import type {} from '@deepseek-ai/dsh-system-prompt';
import type {} from '@deepseek-ai/dsh-tools';
import type { ApprovalService } from '@deepseek-ai/dsh-user-approval';
import Schema from '@deepseek-ai/schemastery';

import { createAttachmentStore, type AttachmentStore } from './attachments/store.js';
import {
  createAttachmentHttp,
  CHANNEL_ATTACHMENT_PATH,
  CHANNEL_ATTACHMENT_UPLOAD_PATH,
} from './attachments/http.js';
import { createBridgeMethods } from './bridge/methods.js';
import type { BotAgentSetupInfo } from './runtime/dsh-bot-agent-adapter.js';
import { registerBridge } from './bridge/rpc.js';
import { createPersonaBotRegistry, type PersonaBotRegistry } from './bots/registry.js';
import { createBotAvatarHttp, BOT_AVATAR_PATH } from './bots/avatar-http.js';
import { createChannelLiveHub, CHANNEL_STREAM_PATH, type ChannelLiveHub } from './channels/live.js';
import type { ChannelDraftEvent } from './channels/draft.js';
import { DeveloperModeSkillGate } from './logs/skill.js';
import type { ChannelStore } from './channels/store.js';
import { createSqliteChannelStore } from './channels/sqlite-store.js';
import {
  attachOperationalModule,
  mountOperationalDatabase,
  type OperationalDatabaseOwner,
} from './database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from './database/schema-plan.js';
import { resolveDshHome } from './im/config-store.js';
import { ensureMemoryRepository } from './memory/repository.js';
import { cloneMemoryRepository } from './memory/clone.js';
import { createMemoryService, type MemoryService } from './memory/service.js';
import { createRosterStore, type RosterStore } from './roster/store.js';
import {
  createBotRuntime,
  type AssignmentEventTail,
  type BotAgentAdapter,
  type BotRuntime,
} from './runtime/bot-runtime.js';
import { createBotAttentionQuery, type BotAttentionQuery } from './runtime/attention.js';
import { createBotSourcePolicyStore, type BotSourcePolicyStore } from './runtime/source-policy.js';
import {
  createHumanAttentionQuery,
  createHumanAttentionDecisions,
  type HumanAttentionQuery,
  type HumanAttentionDecisions,
} from './runtime/human-attention.js';
import {
  grantExecutionDenial,
  grantToolExecutionDenial,
  isSafeMemoryDirectoryListing,
  requiresHumanToolApproval,
} from './workspaces/grant-execution.js';
import { ChannelToolApproval } from './workspaces/tool-approval.js';
import { ChannelUserQuestions } from './channels/user-questions.js';
import {
  createAssignmentAccessStore,
  type AssignmentAccessStore,
} from './workspaces/assignment-access.js';
import {
  createToolApprovalRuleStore,
  type ToolApprovalRuleStore,
} from './workspaces/tool-approval-rules.js';
import {
  createWorkspaceGrantStore,
  type DshWorkspaceLookup,
  type WorkspaceGrantStore,
} from './workspaces/grants.js';
import {
  createDshBotAgentAdapter,
  type DshAgentPresetHost,
  type DshDefaultModelHost,
} from './runtime/dsh-bot-agent-adapter.js';
import { createSessionOwnership, type SessionOwnership } from './sessions/ownership.js';
import {
  readAssignmentReportPage,
  readBoundedAssignmentTail,
  type AssignmentSessionQuery,
  type AssignmentReportPage,
} from './runtime/assignment-tail.js';
import type { DshSessionEvent, DshSessionStore } from './sessions/source.js';
import { createBotStateTracker, type BotStateTracker } from './state/bot-state.js';
import { createDshActivityProjection } from './state/dsh-activity.js';
import { createUsageProjection, type UsageProjection } from './usage/usage.js';

export const name = 'botharness-core';

export const inject = ['tools', 'systemPrompt', 'sessions', 'agents', 'agentDefaultModel'];

export const PERSONA_SECTION_ORDER = 10400;

const COMPACTION_END_EVENT: string = 'compaction/end';

export interface CompactionRefreshSink {
  ownership: { resolve(sessionId: string): { botSlug: string } | undefined };
  memory: {
    refreshPersonaAfterCompaction(botSlug: string, sessionId: string): { refreshed: boolean };
  };
  warn(message: string): void;
}

export function handleCompactionEvent(
  sink: CompactionRefreshSink,
  sessionId: string,
  eventType: string,
): void {
  if (eventType !== COMPACTION_END_EVENT) return;
  const owner = sink.ownership.resolve(sessionId);
  if (owner === undefined) return;
  try {
    sink.memory.refreshPersonaAfterCompaction(owner.botSlug, sessionId);
  } catch (error) {
    sink.warn(`botharness: persona refresh after compaction failed: ${String(error)}`);
  }
}

export interface BotHarnessConfig {
  enabled: boolean;

  agentPreset?: string;
}

export const DEFAULT_AGENT_PRESET = 'standard';

export const DEFAULT_CONFIG: BotHarnessConfig = {
  enabled: true,
  agentPreset: DEFAULT_AGENT_PRESET,
};

export const Config = Schema.object({
  enabled: Schema.boolean().default(DEFAULT_CONFIG.enabled).description('启用 BotHarness core'),
  agentPreset: Schema.string()
    .default(DEFAULT_AGENT_PRESET)
    .description('PersonaBot 会话加入的 DSH agent preset（提供 file/Shell/grep 等普通工具）'),
});

export interface BotHarnessCore {
  rootDir: string;
  operationalDatabase: OperationalDatabaseOwner;
  registry: PersonaBotRegistry;

  contributeBotAgentSetup(contribute: BotAgentSetup): () => void;

  hostTools: Set<string>;

  runBotAgentSetups(
    agentCtx: Context,
    agent: import('@deepseek-ai/dsh-agent').Agent,
    info: BotAgentSetupInfo,
  ): void;
  states: BotStateTracker;
  ownership: SessionOwnership;
  memory: MemoryService;

  usage?: UsageProjection;
  channels: ChannelStore;
  attachments: AttachmentStore;
  live: ChannelLiveHub;
  roster: RosterStore;
  runtime: BotRuntime;
  attention: BotAttentionQuery;
  sourcePolicy: BotSourcePolicyStore;
  humanAttention: HumanAttentionQuery;
  humanAttentionDecisions: HumanAttentionDecisions;
  grants: WorkspaceGrantStore;
  toolRules: ToolApprovalRuleStore;
  assignmentAccess: AssignmentAccessStore;
}

function unavailableAgentAdapter(): BotAgentAdapter {
  const unavailable = () =>
    Promise.reject(new Error('BotHarness Agent runtime is unavailable outside a DSH Host'));
  return {
    runOrchestrator: unavailable,
    runAssignment: unavailable,
    requestAssignment: () => {
      throw new Error('BotHarness Agent runtime is unavailable outside a DSH Host');
    },
    close: async () => undefined,
  };
}

type BotAgentSetup = (
  agentCtx: import('@deepseek-ai/cordis').Context,
  agent: import('@deepseek-ai/dsh-agent').Agent,
  info: BotAgentSetupInfo,
) => void;

export function createCore(
  options: {
    dshHome?: string;
    warn?: (message: string) => void;
    agents?: BotAgentAdapter;
    saveReportSpill?: (input: {
      sessionId: string;
      content: string;
    }) => Promise<{ locator: string; bytes: number; retrievalHint: string }>;
    readAssignmentTail?: (sessionId: string) => Promise<AssignmentEventTail>;
    readAssignmentReportPage?: (
      sessionId: string,
      acceptedSummary: string,
      offset: number,
    ) => Promise<AssignmentReportPage>;
    workspaces?: () => DshWorkspaceLookup | undefined;
    activeQuestionMessageIds?: () => readonly string[];
    activeToolApprovalMessageIds?: () => readonly string[];
  } = {},
): BotHarnessCore {
  const dshHome = options.dshHome ?? resolveDshHome();
  const rootDir = join(dshHome, 'botharness', 'bots');
  const registry = createPersonaBotRegistry({
    rootDir,
    cloneMemory: (destination, url) => cloneMemoryRepository({ destination, url }),
    initializeMemory: (memoryDir) => {
      const repository = ensureMemoryRepository({ memoryDir });
      return repository.ok
        ? { ok: true }
        : {
            ok: false,
            ...(repository.code === 'git-not-found' ? { code: 'git-not-found' as const } : {}),
            message: `${repository.code}: ${repository.message}`,
          };
    },
  });
  const states = createBotStateTracker();
  let live: ChannelLiveHub | undefined;
  let runtime: BotRuntime | undefined;
  const attachments = createAttachmentStore({
    rootDir: join(dshHome, 'botharness', 'attachments'),
  });
  const operationalDatabase = mountOperationalDatabase({
    dshHome,
    schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
  });
  const sourcePolicy = createBotSourcePolicyStore(
    attachOperationalModule(operationalDatabase, 'bot-inbox'),
  );
  const channels = createSqliteChannelStore({
    database: attachOperationalModule(operationalDatabase, 'messaging'),
    sourcePolicy,
    databaseOwnerReady: operationalDatabase.mode === 'ready',
    isBotActive: (botSlug) => {
      const bot = registry.get(botSlug);
      return bot !== undefined && bot.paused !== true;
    },
    attachments,
    botDisplayName: (botSlug) => registry.get(botSlug)?.displayName,
    rootDir: join(dshHome, 'botharness', 'channels'),
    onCommitted: (commit) => {
      let publicationFailed = false;
      try {
        live?.publishCommitted(commit);
      } catch {
        publicationFailed = true;
      }
      if (commit.message.memberDeparture !== undefined) {
        try {
          runtime?.admitGroupMessage(commit.channelId, commit.message.id);
        } catch {
          runtime?.retryGroupMessageAdmission?.(commit.channelId, commit.message.id);
          options.warn?.('group-admission-wake-failed-retrying');
        }
      }
      if (publicationFailed) options.warn?.('channel-live-publication-failed');
    },
    onRecordChanged: () => live?.publishRosterCommitted(),
    onAdmissionChanged: (channelId, messageId, message) =>
      live?.publishAdmission(channelId, messageId, message),
    onHumanReadChanged: (channelId, humanId, revision) =>
      live?.publishHumanRead(channelId, humanId, revision),
    ...(options.warn === undefined ? {} : { warn: options.warn }),
  });
  const attention = createBotAttentionQuery(
    attachOperationalModule(operationalDatabase, 'messaging'),
    channels,
  );
  const humanAttentionDatabase = attachOperationalModule(operationalDatabase, 'human-attention');
  const humanAttention = createHumanAttentionQuery(
    humanAttentionDatabase,
    options.activeQuestionMessageIds,
    options.activeToolApprovalMessageIds,
  );
  const humanAttentionDecisions = createHumanAttentionDecisions(humanAttentionDatabase);
  live = createChannelLiveHub(channels);
  if (operationalDatabase.mode === 'ready')
    for (const bot of registry.list())
      if (bot.paused === true) channels.cancelInvitationsForBot(bot.slug);
  const ownership = createSessionOwnership(
    attachOperationalModule(operationalDatabase, 'session-ownership'),
  );
  const memory = createMemoryService({ registry, ownership, database: operationalDatabase });
  const usage =
    operationalDatabase.mode === 'ready'
      ? createUsageProjection({ ownership, database: operationalDatabase })
      : undefined;
  const grants = createWorkspaceGrantStore({
    database: attachOperationalModule(operationalDatabase, 'workspace-grants'),
    workspaces: options.workspaces ?? (() => undefined),
  });
  const toolRules = createToolApprovalRuleStore(
    attachOperationalModule(operationalDatabase, 'tool-approval-rules'),
  );
  const assignmentAccess = createAssignmentAccessStore(
    attachOperationalModule(operationalDatabase, 'assignment-access'),
  );
  const orchestratorCwd = (bot: { slug: string }): string | undefined =>
    registry.memoryDirFor(bot.slug);
  const hostTools = new Set<string>();
  const botAgentSetups = new Set<BotAgentSetup>();
  const contributeBotAgentSetup = (contribute: BotAgentSetup): (() => void) => {
    botAgentSetups.add(contribute);
    return () => {
      botAgentSetups.delete(contribute);
    };
  };
  const runBotAgentSetups = (
    agentCtx: import('@deepseek-ai/cordis').Context,
    agent: import('@deepseek-ai/dsh-agent').Agent,
    info: BotAgentSetupInfo,
  ): void => {
    for (const contribute of [...botAgentSetups]) contribute(agentCtx, agent, info);
  };

  runtime = createBotRuntime({
    database: operationalDatabase,
    sourcePolicy,
    registry,
    channels,
    attachments,
    agents: options.agents ?? unavailableAgentAdapter(),
    ...(options.saveReportSpill === undefined ? {} : { saveReportSpill: options.saveReportSpill }),
    ...(options.readAssignmentTail === undefined
      ? {}
      : { readAssignmentTail: options.readAssignmentTail }),
    ...(options.readAssignmentReportPage === undefined
      ? {}
      : { readAssignmentReportPage: options.readAssignmentReportPage }),
    memory,
    ownership,
    grants,
    assignmentAccess,
    workspaceRoot: join(dshHome, 'botharness', 'runtime-workspaces'),
    orchestratorCwd,
    ...(options.warn === undefined ? {} : { warn: options.warn }),
  });
  return {
    rootDir,
    operationalDatabase,
    registry,
    contributeBotAgentSetup,
    runBotAgentSetups,
    hostTools,
    states,
    ownership,
    memory,
    ...(usage === undefined ? {} : { usage }),
    grants,
    toolRules,
    assignmentAccess,
    channels,
    attention,
    sourcePolicy,
    humanAttention,
    humanAttentionDecisions,
    attachments,
    live,
    roster: createRosterStore({
      warn: options.warn,
      onCommitted: () => live?.publishRosterCommitted(),
    }),
    runtime,
  };
}

export function apply(ctx: Context, config: BotHarnessConfig): void {
  if (!config.enabled) return;
  const dshHome = resolveDshHome();
  let publishDraft: (event: ChannelDraftEvent) => void = () => undefined;
  const agentAdapter = createDshBotAgentAdapter({
    agents: ctx.agents,
    defaultModel: (ctx as unknown as { agentDefaultModel: DshDefaultModelHost }).agentDefaultModel,
    orchestratorCwd: (bot) => core.registry.memoryDirFor(bot.slug),
    defaultAgentPreset: config.agentPreset ?? DEFAULT_AGENT_PRESET,
    resolveAgentPresets: () => ctx.get('agentPresets') as DshAgentPresetHost | undefined,
    publishDraft: (event) => publishDraft(event),
    onAgentSetup: (agentCtx, agent, info) => core.runBotAgentSetups(agentCtx, agent, info),
    authorizeBorrow: (agent, role) => {
      const owner = core.ownership.resolve(agent.session.id);
      if (owner?.rootRole !== role) throw new Error('BotHarness Agent role mismatch');
      const denial = grantExecutionDenial(
        core,
        agent.session,
        ctx.get('sandboxPolicy'),
        ctx.get('approval'),
      );
      if (denial !== undefined) throw new Error(denial);
    },
  });
  let userQuestions: ChannelUserQuestions | undefined;
  let toolApproval: ChannelToolApproval | undefined;
  const core = createCore({
    dshHome,
    activeQuestionMessageIds: () => userQuestions?.activeMessageIds() ?? [],
    activeToolApprovalMessageIds: () => toolApproval?.activeMessageIds() ?? [],
    warn: (message) => ctx.logger.warn(message),
    agents: agentAdapter,
    saveReportSpill: async ({ sessionId, content }) => {
      const spillStore = ctx.get('spillStore') as unknown as
        | {
            saveText(input: {
              owner: { sessionId: string };
              source: { kind: 'session-reference'; sessionId: string; label: string };
              suggestedName: string;
              content: string;
            }): Promise<{ locator: string; bytes: number; retrievalHint: string }>;
          }
        | undefined;
      if (spillStore === undefined) throw new Error('DSH Spill service is unavailable');
      return spillStore.saveText({
        owner: { sessionId },
        source: { kind: 'session-reference', sessionId, label: 'Assignment report' },
        suggestedName: 'assignment-report.txt',
        content,
      });
    },
    readAssignmentTail: async (sessionId) => {
      const query = ctx.get('sessionQuery') as unknown as AssignmentSessionQuery | undefined;
      if (query === undefined) throw new Error('DSH Session Query is unavailable');
      return readBoundedAssignmentTail(query, sessionId);
    },
    readAssignmentReportPage: async (sessionId, acceptedSummary, offset) => {
      const query = ctx.get('sessionQuery') as unknown as AssignmentSessionQuery | undefined;
      if (query === undefined) throw new Error('DSH Session Query is unavailable');
      return readAssignmentReportPage(query, sessionId, acceptedSummary, offset);
    },
    workspaces: () => ctx.get('workspaceRegistry') as unknown as DshWorkspaceLookup | undefined,
  });
  publishDraft = (event) => core.live.publishDraft(event);
  ctx.effect(() => () => core.operationalDatabase.close(), 'botharness: operational database');
  ctx.effect(() => () => core.runtime.close(), 'botharness: bot runtime');
  ctx.effect(() => () => core.live.close(), 'botharness: Channel live hub');
  ctx.provide('botharness', core);

  const permissionDenial = (session: import('@deepseek-ai/dsh-session').Session) =>
    grantExecutionDenial(core, session, ctx.get('sandboxPolicy'), ctx.get('approval'));

  ctx.on(
    'agent/pre-step',
    async ({ agent }, next) =>
      permissionDenial(agent.session) === undefined ? next() : { kind: 'reject' },
    { global: true },
  );
  toolApproval = new ChannelToolApproval(
    core.channels,
    core.ownership,
    core.toolRules,
    (agent, owner) => {
      const cwd = agent.session.header.cwd ?? '';
      if (owner.rootRole === 'assignment') {
        const assignment = core.runtime.getAssignment(owner.botSlug, owner.sessionId);
        const grantId = assignment?.permission?.grantId;
        if (grantId === undefined) return undefined;
        try {
          core.grants.requireActive(owner.botSlug, grantId);
        } catch {
          return undefined;
        }
        return JSON.stringify(['assignment', cwd, grantId]);
      }
      const activeIds = core.grants
        .list(owner.botSlug)
        .filter((grant) => grant.revokedAt === undefined)
        .map((grant) => grant.id)
        .sort();
      return JSON.stringify(['orchestrator', cwd, activeIds]);
    },
  );
  userQuestions = new ChannelUserQuestions(
    core.channels,
    core.ownership,
    (agent) => ctx.agents.get(agent.id) === agent,
    (message) => ctx.logger.warn(message),
  );
  ctx.effect(() => () => userQuestions.close(), 'botharness: Channel user questions');
  ctx.on(
    'user-questions/request',
    async (request, next) => (await userQuestions.ask(request)) ?? next(),
    { global: true },
  );
  const approvedCalls = new Set<symbol>();
  ctx.effect(() => () => toolApproval.close(), 'botharness: Channel tool approvals');
  ctx.on('approval/request', async (request, next) => (await toolApproval.ask(request)) ?? next(), {
    global: true,
  });
  ctx.on(
    'tools/pre-execute',
    async (execution, next) => {
      const agent = execution.agent;
      if (agent === undefined || core.ownership.resolve(agent.session.id) === undefined)
        return next();
      if (!requiresHumanToolApproval(execution.name)) return next();
      if (isSafeMemoryDirectoryListing(core, agent.session, execution.name, execution.arguments))
        return next();

      const computerTools = ctx.get('botharnessComputerTools') as
        | {
            ownsTool?(name: string): boolean;
            needsAuthorization?(sessionId: string): boolean;
            markAuthorized?(sessionId: string): void;
          }
        | undefined;
      if (computerTools?.ownsTool?.(execution.name) === true) {
        if (computerTools.needsAuthorization?.(agent.session.id) !== true) return next();
        const computerApproval = ctx.get('approval') as ApprovalService | undefined;
        const untrackComputer = toolApproval.track(execution);
        if (computerApproval === undefined || untrackComputer === undefined) {
          return { kind: 'deny', reason: 'The tool call cannot be presented for Human approval' };
        }
        try {
          const outcome = await computerApproval.request({
            agent,
            toolName: execution.name,
            callId: execution.callId,
            reason: "This PersonaBot wants to act on the profile's shared Computer.",
            signal: execution.signal,
          });
          if (outcome !== 'allowed-once') {
            return { kind: 'deny', reason: 'Human approval was ' + outcome };
          }
          computerTools.markAuthorized?.(agent.session.id);
          approvedCalls.add(execution.token);
          return await next();
        } catch {
          return { kind: 'deny', reason: 'Human approval is unavailable' };
        } finally {
          untrackComputer();
        }
      }
      const denial = permissionDenial(agent.session);
      if (denial !== undefined) return { kind: 'deny', reason: denial };
      if (
        typeof execution.arguments === 'object' &&
        execution.arguments !== null &&
        'sandbox_permissions' in execution.arguments
      ) {
        return {
          kind: 'deny',
          reason: 'BotHarness Session cannot request sandbox permission escalation',
        };
      }
      const owner = core.ownership.resolve(agent.session.id);
      const snapshot =
        owner?.rootRole === 'assignment'
          ? core.runtime.getAssignment(owner.botSlug, owner.sessionId)?.permission
          : undefined;
      if (snapshot?.mode === 'danger-full-access') return next();
      const approval = ctx.get('approval') as ApprovalService | undefined;
      const untrack = toolApproval.track(execution);
      if (approval === undefined || untrack === undefined) {
        return { kind: 'deny', reason: 'The tool call cannot be presented for Human approval' };
      }
      try {
        const outcome = await approval.request({
          agent,
          toolName: execution.name,
          callId: execution.callId,
          reason: 'This tool call may access files outside the authorized folder.',
          signal: execution.signal,
        });
        if (outcome !== 'allowed-once') {
          return { kind: 'deny', reason: 'Human approval was ' + outcome };
        }
        if (!toolApproval.validAfterDecision(agent, execution.callId))
          return { kind: 'deny', reason: 'Approval rule scope changed' };
        approvedCalls.add(execution.token);
        return await next();
      } catch {
        return { kind: 'deny', reason: 'Human approval is unavailable' };
      } finally {
        untrack();
      }
    },
    { global: true },
  );

  ctx.tools.guard(({ agent, name, arguments: args, token }) => {
    const allowedOnce = approvedCalls.delete(token);
    return agent === undefined
      ? undefined
      : grantToolExecutionDenial(
          core,
          agent.session,
          ctx.get('sandboxPolicy'),
          ctx.get('approval'),
          name,
          args,
          allowedOnce,
        );
  });
  ctx.on(
    'tools/result',
    (execution) => {
      approvedCalls.delete(execution.token);
    },
    { global: true },
  );

  ctx.on(
    'agent/assistant-stream',
    ({ agent, frame }) => agentAdapter.acceptAssistantStream(agent.session.id, frame),
    { global: true },
  );

  const dshSessions = (ctx as unknown as { sessions: DshSessionStore }).sessions;

  const developerModeTarget: { gate?: DeveloperModeSkillGate } = {};
  registerBridge(
    ctx,
    createBridgeMethods({
      registry: core.registry,
      states: core.states,
      channels: core.channels,
      ownership: core.ownership,
      memory: core.memory,
      ...(core.usage === undefined ? {} : { usage: core.usage }),
      roster: core.roster,
      runtime: core.runtime,
      attention: core.attention,
      sourcePolicy: core.sourcePolicy,
      humanAttention: core.humanAttention,
      humanAttentionDecisions: core.humanAttentionDecisions,
      grants: core.grants,
      toolApproval,
      userQuestions,
      toolRules: core.toolRules,
      assignmentAccess: core.assignmentAccess,
      developerMode: {
        set: (enabled: boolean) => developerModeTarget.gate?.set(enabled),
      },
      computerAccess: {
        changed: (slug: string) => {
          const provider = ctx.get('botharnessComputerTools') as unknown as
            | { reconcileBot?: (slug: string) => Promise<void> }
            | undefined;
          const pending = provider?.reconcileBot?.(slug);
          void pending?.catch((error: unknown) => {
            ctx.logger.warn(
              `botharness: Computer tool reconcile failed for ${slug}: ${String(error)}`,
            );
          });
        },
      },
    }),
  );

  ctx.inject(['skills'], (skillsCtx) => {
    const skills = (
      skillsCtx as unknown as {
        skills: {
          register(skill: {
            readonly name: string;
            readonly description: string;
            readonly whenToUse: string;
            readonly content: string;
            readonly invocation: {
              readonly modelInvocable: boolean;
              readonly userInvocable: boolean;
            };
            readonly source: string;
            readonly provider: string;
          }): () => void;
        };
      }
    ).skills;
    developerModeTarget.gate = new DeveloperModeSkillGate({
      register: (definition) => {
        let dispose: (() => void) | undefined;
        skillsCtx.effect(() => {
          dispose = skills.register(definition);
          return () => dispose?.();
        }, 'botharness: operational logs skill');
        return () => dispose?.();
      },
    });
  });

  ctx.inject(['connection'], (connectionCtx) => {
    const connection = (
      connectionCtx as unknown as {
        connection: {
          fetch: {
            register(route: {
              path: string;
              methods: readonly ('GET' | 'POST')[];
              requestBody: 'buffered' | 'streaming';
              fetch(request: Request): Promise<Response>;
            }): () => Promise<void>;
          };
        };
      }
    ).connection;
    connectionCtx.effect(() => {
      return connection.fetch.register({
        path: CHANNEL_STREAM_PATH,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: async (request) => {
          return core.live.open(request);
        },
      });
    }, 'botharness: Channel live stream');
    const attachmentHttp = createAttachmentHttp(core.attachments);
    connectionCtx.effect(
      () =>
        connection.fetch.register({
          path: CHANNEL_ATTACHMENT_UPLOAD_PATH,
          methods: ['POST'],
          requestBody: 'streaming',
          fetch: attachmentHttp,
        }),
      'botharness: Channel attachment upload',
    );
    connectionCtx.effect(
      () =>
        connection.fetch.register({
          path: CHANNEL_ATTACHMENT_PATH,
          methods: ['GET'],
          requestBody: 'buffered',
          fetch: attachmentHttp,
        }),
      'botharness: Channel attachment download',
    );
    const botAvatarHttp = createBotAvatarHttp(core.registry);
    connectionCtx.effect(
      () =>
        connection.fetch.register({
          path: BOT_AVATAR_PATH,
          methods: ['GET'],
          requestBody: 'buffered',
          fetch: botAvatarHttp,
        }),
      'botharness: PersonaBot avatar',
    );
  });
  const activity = createDshActivityProjection({
    ownership: core.ownership,
    states: core.states,
  });

  ctx.on(
    'session/event',
    (session, event) => {
      activity.handleSessionEvent(session.id, event);
      core.usage?.handleSessionEvent(session.id, event);
      handleCompactionEvent(
        {
          ownership: core.ownership,
          memory: core.memory,
          warn: (message) => ctx.logger.warn(message),
        },
        session.id,
        event.type,
      );
    },
    { global: true },
  );
  ctx.on(
    'agent/created',
    ({ agent }) => {
      activity.handleAgentCreated(agent.session);
    },
    { global: true },
  );
  ctx.on(
    'agent/disposed',
    ({ agent }) => {
      activity.handleSessionDisposed(agent.session.id);
    },
    { global: true },
  );
  activity.rebuild(dshSessions.list());
  if (core.usage !== undefined) {
    const usage = core.usage;

    ctx.inject(['sessionQuery'], (sessionCtx) => {
      const query = sessionCtx.get('sessionQuery') as unknown as
        | {
            readSession(id: string): Promise<{
              events: readonly DshSessionEvent[];
              inheritedEventCount?: number;
            }>;
          }
        | undefined;
      if (query === undefined) return;
      const readUsageLog = async (sessionId: string) => {
        try {
          const snapshot = await query.readSession(sessionId);
          return {
            events: snapshot.events,
            inheritedEventCount: snapshot.inheritedEventCount ?? 0,
          };
        } catch (error) {
          ctx.logger.warn(`botharness: usage log read failed for ${sessionId}: ${String(error)}`);
          return undefined;
        }
      };
      const tracked = core.ownership.list().map((record) => record.sessionId);
      void usage.rebuild(tracked, readUsageLog).then(
        (report) => {
          ctx.logger.info(
            `botharness: usage projection rebuilt (${report.folded} turns, ${report.failed} failed sessions)`,
          );
        },
        (error: unknown) => {
          ctx.logger.warn(`botharness: usage projection rebuild failed: ${String(error)}`);
        },
      );
    });
  }

  ctx.inject(['storageDomain'], (storageCtx) => {
    void core.roster.attach(storageCtx.storageDomain).catch((error: unknown) => {
      ctx.logger.warn(`botharness: failed to open the roster domain: ${String(error)}`);
    });
    storageCtx.effect(() => () => core.roster.detach(), 'botharness: roster domain');
  });

  ctx.systemPrompt.section({
    name: 'botharness:persona',
    order: PERSONA_SECTION_ORDER,
    text: ({ agent }) => core.memory.personaForSession(agent?.session?.id),
  });
}
