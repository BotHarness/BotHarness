import { join } from 'node:path';

import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-system-prompt';
import type {} from '@deepseek-ai/dsh-tools';
import Schema from '@deepseek-ai/schemastery';

import { createBridgeMethods } from './bridge/methods.js';
import { registerBridge } from './bridge/rpc.js';
import { createPersonaBotRegistry, type PersonaBotRegistry } from './bots/registry.js';
import { createChannelStore, type ChannelStore } from './channels/store.js';
import { mountOperationalDatabase, type OperationalDatabaseOwner } from './database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from './database/schema-plan.js';
import { resolveDshHome } from './im/config-store.js';
import { createMemoryService, type MemoryService } from './memory/service.js';
import { createMemoryTools } from './memory/tools.js';
import { formatMemoryTree } from './memory/tree.js';
import { createRosterStore, type RosterStore } from './roster/store.js';
import { createBotRuntime, type BotAgentAdapter, type BotRuntime } from './runtime/bot-runtime.js';
import {
  createDshBotAgentAdapter,
  type DshDefaultModelHost,
} from './runtime/dsh-bot-agent-adapter.js';
import { createDshSessionSource, type DshSessionStore } from './sessions/source.js';
import { createBotStateTracker, type BotStateTracker } from './state/bot-state.js';

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
  const registry = createPersonaBotRegistry({ rootDir });
  const states = createBotStateTracker();
  const memory = createMemoryService({ registry });
  const channels = createChannelStore({ rootDir: join(dshHome, 'botharness', 'channels') });
  const operationalDatabase = mountOperationalDatabase({
    dshHome,
    schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
  });
  return {
    rootDir,
    operationalDatabase,
    registry,
    states,
    memory,
    channels,
    roster: createRosterStore({ warn: options.warn }),
    runtime: createBotRuntime({
      database: operationalDatabase,
      registry,
      channels,
      agents: options.agents ?? unavailableAgentAdapter(),
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
    }),
  });
  ctx.effect(() => () => core.operationalDatabase.close(), 'botharness: operational database');
  ctx.effect(() => () => core.runtime.close(), 'botharness: bot runtime');
  ctx.provide('botharness', core);

  for (const tool of createMemoryTools({
    resolveStore: (exec) => core.memory.storeForAgent(exec.agent),
  })) {
    ctx.tools.register(tool);
  }

  registerBridge(
    ctx,
    createBridgeMethods({
      registry: core.registry,
      states: core.states,
      channels: core.channels,
      sessions: createDshSessionSource((ctx as unknown as { sessions: DshSessionStore }).sessions),
      roster: core.roster,
      runtime: core.runtime,
    }),
  );

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
