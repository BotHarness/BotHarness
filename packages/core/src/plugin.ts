import { join } from 'node:path';

import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-system-prompt';
import type {} from '@deepseek-ai/dsh-tools';
import Schema from '@deepseek-ai/schemastery';

import { createPersonaBotRegistry, type PersonaBotRegistry } from './bots/registry.js';
import { resolveDshHome } from './im/config-store.js';
import { createMemoryService, type MemoryService } from './memory/service.js';
import { createMemoryTools } from './memory/tools.js';
import { formatMemoryTree } from './memory/tree.js';
import { createBotStateTracker, type BotStateTracker } from './state/bot-state.js';

export const name = 'botharness-core';

export const inject = ['tools', 'systemPrompt'];

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
  registry: PersonaBotRegistry;
  states: BotStateTracker;
  memory: MemoryService;
}

export function createCore(options: { dshHome?: string } = {}): BotHarnessCore {
  const rootDir = join(options.dshHome ?? resolveDshHome(), 'botharness', 'bots');
  const registry = createPersonaBotRegistry({ rootDir });
  return {
    rootDir,
    registry,
    states: createBotStateTracker(),
    memory: createMemoryService({ registry }),
  };
}

export function apply(ctx: Context, config: BotHarnessConfig): void {
  if (!config.enabled) return;
  const core = createCore();
  ctx.provide('botharness', core);

  for (const tool of createMemoryTools({
    resolveStore: (exec) => core.memory.storeForAgent(exec.agent),
  })) {
    ctx.tools.register(tool);
  }

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
