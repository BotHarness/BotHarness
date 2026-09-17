import type { PersonaBotRegistry } from '../bots/registry.js';
import { createMemoryStore, type MemoryStore } from './store.js';

export interface MemoryAgentRef {
  session?: { header?: { cwd?: string } };
}

export interface MemoryServiceOptions {
  registry: PersonaBotRegistry;
  now?: () => Date;
}

export interface MemoryService {
  storeForCwd(cwd: string | undefined): MemoryStore | undefined;
  storeForAgent(agent: MemoryAgentRef | undefined): MemoryStore | undefined;
}

export function createMemoryService(options: MemoryServiceOptions): MemoryService {
  const { registry } = options;
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
  };
}
