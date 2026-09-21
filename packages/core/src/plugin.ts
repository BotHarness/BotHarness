import { join } from 'node:path';

import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-session';
import type {} from '@deepseek-ai/dsh-system-prompt';
import type {} from '@deepseek-ai/dsh-tools';
import Schema from '@deepseek-ai/schemastery';

import { createBridgeMethods } from './bridge/methods.js';
import { registerBridge } from './bridge/rpc.js';
import { createPersonaBotRegistry, type PersonaBotRegistry } from './bots/registry.js';
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
import { formatMemoryTree } from './memory/tree.js';
import { createRosterStore, type RosterStore } from './roster/store.js';
import { createBotRuntime, type BotAgentAdapter, type BotRuntime } from './runtime/bot-runtime.js';
import {
  createDshBotAgentAdapter,
  type DshDefaultModelHost,
} from './runtime/dsh-bot-agent-adapter.js';
import { createSessionOwnership, type SessionOwnership } from './sessions/ownership.js';
import { createDshSessionSource, type DshSessionStore } from './sessions/source.js';
import { createBotStateTracker, type BotStateTracker } from './state/bot-state.js';
import { createDshActivityProjection } from './state/dsh-activity.js';

export const name = 'botharness-core';

export const inject = ['tools', 'systemPrompt', 'sessions', 'agents', 'agentDefaultModel'];

export const PERSONA_SECTION_ORDER = 10400;
export const MEMORY_TREE_SECTION_ORDER = 10500;

export interface BotHarnessConfig {
  enabled: boolean;
}

export const DEFAULT_CONFIG: BotHarnessConfig = {
  enabled: true,
};

export const Config = Schema.object({
  enabled: Schema.boolean().default(DEFAULT_CONFIG.enabled).description('启用 BotHarness core'),
});

export interface BotHarnessCore {
  rootDir: string;
  operationalDatabase: OperationalDatabaseOwner;
  registry: PersonaBotRegistry;
  states: BotStateTracker;
  ownership: SessionOwnership;
  memory: MemoryService;
  channels: ChannelStore;
  roster: RosterStore;
  runtime: BotRuntime;
}

function unavailableAgentAdapter(): BotAgentAdapter {
  const unavailable = () =>
    Promise.reject(new Error('BotHarness Agent runtime is unavailable outside a DSH Host'));
  return {
    runOrchestrator: unavailable,
    runAssignment: unavailable,
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
  const channels = createChannelStore({ rootDir: join(dshHome, 'botharness', 'channels') });
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
    roster: createRosterStore({ warn: options.warn }),
    runtime: createBotRuntime({
      database: operationalDatabase,
      registry,
      channels,
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
  const core = createCore({
    dshHome,
    warn: (message) => ctx.logger.warn(message),
    agents: createDshBotAgentAdapter({
      agents: ctx.agents,
      defaultModel: (ctx as unknown as { agentDefaultModel: DshDefaultModelHost })
        .agentDefaultModel,
      defaultWorkspaceRoot: join(dshHome, 'botharness', 'runtime-workspaces'),
      orchestratorCwd: (bot) => core.registry.memoryDirFor(bot.slug),
    }),
  });
  ctx.effect(() => () => core.operationalDatabase.close(), 'botharness: operational database');
  ctx.effect(() => () => core.runtime.close(), 'botharness: bot runtime');
  ctx.provide('botharness', core);

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
    text: ({ agent }) => core.memory.storeForAgent(agent)?.persona() ?? '',
  });
  ctx.systemPrompt.section({
    name: 'botharness:memory-tree',
    order: MEMORY_TREE_SECTION_ORDER,
    text: ({ agent }) => {
      const store = core.memory.storeForAgent(agent);
      if (store === undefined) return '';
      return formatMemoryTree(store.tree());
    },
  });
}
