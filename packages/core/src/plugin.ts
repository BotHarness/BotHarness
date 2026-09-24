import { join } from 'node:path';

import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-session';
import type {} from '@deepseek-ai/dsh-system-prompt';
import type {} from '@deepseek-ai/dsh-tools';
import Schema from '@deepseek-ai/schemastery';

import { createAttachmentStore, type AttachmentStore } from './attachments/store.js';
import {
  createAttachmentHttp,
  CHANNEL_ATTACHMENT_PATH,
  CHANNEL_ATTACHMENT_UPLOAD_PATH,
} from './attachments/http.js';
import { createBridgeMethods } from './bridge/methods.js';
import { registerBridge } from './bridge/rpc.js';
import { createPersonaBotRegistry, type PersonaBotRegistry } from './bots/registry.js';
import { createChannelLiveHub, CHANNEL_STREAM_PATH, type ChannelLiveHub } from './channels/live.js';
import type { ChannelDraftEvent } from './channels/draft.js';
import {
  LOGS_SKILL_CONTENT,
  LOGS_SKILL_DESCRIPTION,
  LOGS_SKILL_INVOCATION,
  LOGS_SKILL_NAME,
  LOGS_SKILL_PROVIDER,
  LOGS_SKILL_SOURCE,
  LOGS_SKILL_WHEN_TO_USE,
} from './logs/skill.js';
import { createChannelStore, type ChannelStore } from './channels/store.js';
import {
  attachOperationalModule,
  mountOperationalDatabase,
  type OperationalDatabaseOwner,
} from './database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from './database/schema-plan.js';
import { resolveDshHome } from './im/config-store.js';
import { ensureMemoryRepository } from './memory/repository.js';
import { createMemoryService, type MemoryService } from './memory/service.js';
import { createRosterStore, type RosterStore } from './roster/store.js';
import { createBotRuntime, type BotAgentAdapter, type BotRuntime } from './runtime/bot-runtime.js';
import {
  createDshBotAgentAdapter,
  type DshAgentPresetHost,
  type DshDefaultModelHost,
} from './runtime/dsh-bot-agent-adapter.js';
import { createSessionOwnership, type SessionOwnership } from './sessions/ownership.js';
import { createDshSessionSource, type DshSessionStore } from './sessions/source.js';
import { createBotStateTracker, type BotStateTracker } from './state/bot-state.js';
import { createDshActivityProjection } from './state/dsh-activity.js';

export const name = 'botharness-core';

export const inject = ['tools', 'systemPrompt', 'sessions', 'agents', 'agentDefaultModel'];

export const PERSONA_SECTION_ORDER = 10400;

export interface BotHarnessConfig {
  enabled: boolean;
  /** Defaulted by the schema in production; optional so tests can pass a partial config. */
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
  states: BotStateTracker;
  ownership: SessionOwnership;
  memory: MemoryService;
  channels: ChannelStore;
  attachments: AttachmentStore;
  live: ChannelLiveHub;
  roster: RosterStore;
  runtime: BotRuntime;
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

export function createCore(
  options: {
    dshHome?: string;
    warn?: (message: string) => void;
    agents?: BotAgentAdapter;
  } = {},
): BotHarnessCore {
  const dshHome = options.dshHome ?? resolveDshHome();
  const rootDir = join(dshHome, 'botharness', 'bots');
  const registry = createPersonaBotRegistry({
    rootDir,
    initializeMemory: (memoryDir) => {
      const repository = ensureMemoryRepository({ memoryDir });
      return repository.ok
        ? { ok: true }
        : { ok: false, message: `${repository.code}: ${repository.message}` };
    },
  });
  const states = createBotStateTracker();
  let live: ChannelLiveHub | undefined;
  const attachments = createAttachmentStore({
    rootDir: join(dshHome, 'botharness', 'attachments'),
  });
  const channels = createChannelStore({
    attachments,
    rootDir: join(dshHome, 'botharness', 'channels'),
    onCommitted: (commit) => live?.publishCommitted(commit),
    ...(options.warn === undefined ? {} : { warn: options.warn }),
  });
  live = createChannelLiveHub(channels);
  const operationalDatabase = mountOperationalDatabase({
    dshHome,
    schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
  });
  const ownership = createSessionOwnership(
    attachOperationalModule(operationalDatabase, 'session-ownership'),
  );
  const memory = createMemoryService({ registry, ownership });
  const orchestratorCwd = (bot: { slug: string }): string | undefined =>
    registry.memoryDirFor(bot.slug);
  return {
    rootDir,
    operationalDatabase,
    registry,
    states,
    ownership,
    memory,
    channels,
    attachments,
    live,
    roster: createRosterStore({
      warn: options.warn,
      onCommitted: () => live?.publishRosterCommitted(),
    }),
    runtime: createBotRuntime({
      database: operationalDatabase,
      registry,
      channels,
      attachments,
      agents: options.agents ?? unavailableAgentAdapter(),
      ownership,
      workspaceRoot: join(dshHome, 'botharness', 'runtime-workspaces'),
      orchestratorCwd,
    }),
  };
}

export function apply(ctx: Context, config: BotHarnessConfig): void {
  if (!config.enabled) return;
  const dshHome = resolveDshHome();
  let publishDraft: (event: ChannelDraftEvent) => void = () => undefined;
  const agentAdapter = createDshBotAgentAdapter({
    agents: ctx.agents,
    defaultModel: (ctx as unknown as { agentDefaultModel: DshDefaultModelHost }).agentDefaultModel,
    defaultWorkspaceRoot: join(dshHome, 'botharness', 'runtime-workspaces'),
    orchestratorCwd: (bot) => core.registry.memoryDirFor(bot.slug),
    defaultAgentPreset: config.agentPreset ?? DEFAULT_AGENT_PRESET,
    resolveAgentPresets: () => ctx.get('agentPresets') as DshAgentPresetHost | undefined,
    publishDraft: (event) => publishDraft(event),
  });
  const core = createCore({
    dshHome,
    warn: (message) => ctx.logger.warn(message),
    agents: agentAdapter,
  });
  publishDraft = (event) => core.live.publishDraft(event);
  ctx.effect(() => () => core.operationalDatabase.close(), 'botharness: operational database');
  ctx.effect(() => () => core.runtime.close(), 'botharness: bot runtime');
  ctx.effect(() => () => core.live.close(), 'botharness: Channel live hub');
  ctx.provide('botharness', core);

  ctx.on(
    'agent/assistant-stream',
    ({ agent, frame }) => agentAdapter.acceptAssistantStream(agent.session.id, frame),
    { global: true },
  );

  const dshSessions = (ctx as unknown as { sessions: DshSessionStore }).sessions;
  registerBridge(
    ctx,
    createBridgeMethods({
      registry: core.registry,
      states: core.states,
      channels: core.channels,
      sessions: createDshSessionSource(dshSessions),
      ownership: core.ownership,
      roster: core.roster,
      runtime: core.runtime,
    }),
  );

  // Operational-log reader skill (issue #248, Q6): model-only runtime
  // registration in the global layer, so every agent scope sees one
  // directory line and loads the guide body on demand. Runs only when the
  // skills service is composed; the unregister disposer rides the effect.
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
    skillsCtx.effect(
      () =>
        skills.register({
          name: LOGS_SKILL_NAME,
          description: LOGS_SKILL_DESCRIPTION,
          whenToUse: LOGS_SKILL_WHEN_TO_USE,
          content: LOGS_SKILL_CONTENT,
          invocation: LOGS_SKILL_INVOCATION,
          source: LOGS_SKILL_SOURCE,
          provider: LOGS_SKILL_PROVIDER,
        }),
      'botharness: operational logs skill',
    );
  });

  // The shared /api carrier authenticates this exact Fetch route.
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
  });
  const activity = createDshActivityProjection({
    ownership: core.ownership,
    states: core.states,
  });
  ctx.on(
    'session/event',
    (session, event) => {
      activity.handleSessionEvent(session.id, event);
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

  // Storage is an optional capability: without it the plugin still loads and
  // the bridge reports `storage-unavailable` for arrangement writes.
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
