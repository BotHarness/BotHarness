import type { PersonaBotRegistry } from '../bots/registry.js';
import { createMemoryStore, type MemoryStore } from './store.js';
import type { MemoryScope } from './visibility.js';

export interface MemoryAgentRef {
  session?: { header?: { cwd?: string } };
}

export interface MemoryScopeContext {
  agent?: MemoryAgentRef | undefined;
}

export interface MemoryServiceOptions {
  registry: PersonaBotRegistry;
  now?: () => Date;
  ownerId?: string;
}

export interface MemoryService {
  storeForCwd(cwd: string | undefined): MemoryStore | undefined;
  storeForAgent(agent: MemoryAgentRef | undefined): MemoryStore | undefined;
  resolveScope(context?: MemoryScopeContext): MemoryScope;
}

export function createMemoryService(options: MemoryServiceOptions): MemoryService {
  const { registry } = options;
  const configuredOwner = options.ownerId?.trim();
  const ownerId =
    configuredOwner === undefined || configuredOwner.length === 0 ? 'local' : configuredOwner;
  const stores = new Map<string, MemoryStore>();

  const storeForCwd = (cwd: string | undefined): MemoryStore | undefined => {
    if (cwd === undefined || cwd.trim().length === 0) return undefined;
    const record = registry.findByWorkspace(cwd);
    if (record === undefined) return undefined;
    const memoryDir = registry.memoryDirFor(record.slug);
    if (memoryDir === undefined) return undefined;
    let store = stores.get(memoryDir);
    if (store === undefined) {
      store = createMemoryStore({
        memoryDir,
        ...(options.now === undefined ? {} : { now: options.now }),
      });
      stores.set(memoryDir, store);
    }
    return store;
  };

  return {
    storeForCwd,
    storeForAgent(agent) {
      return storeForCwd(agent?.session?.header?.cwd);
    },
    resolveScope() {
      return { kind: 'dm', owner: ownerId };
    },
  };
}
