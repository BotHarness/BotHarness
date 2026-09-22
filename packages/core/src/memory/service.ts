import type { PersonaBotRegistry } from '../bots/registry.js';
import type { SessionOwnership } from '../sessions/ownership.js';
import { inspectMemoryRepository, type MemoryRepositoryInspection } from './repository.js';
import { createMemoryStore, type MemoryStore } from './store.js';

export interface MemoryAgentRef {
  session?: { id?: string };
}

export interface MemoryServiceOptions {
  registry: PersonaBotRegistry;
  ownership: SessionOwnership;
  now?: () => Date;
}

export interface MemoryService {
  /**
   * Resolve the Memory Repository of the PersonaBot that owns one Session.
   * Ownership is explicit; cwd, workspace membership, and UI selection never
   * decide it. An unknown Session or an unready repository returns undefined
   * rather than a store that would pretend Memory works.
   */
  storeForSession(sessionId: string | undefined): MemoryStore | undefined;
  storeForAgent(agent: MemoryAgentRef | undefined): MemoryStore | undefined;
  /** Explicit repository path for diagnostics and repair surfaces. */
  memoryDirFor(sessionId: string | undefined): string | undefined;
  /** Repository health for the Memory surface; never mutates. */
  repositoryFor(sessionId: string | undefined): MemoryRepositoryInspection | undefined;
}

export function createMemoryService(options: MemoryServiceOptions): MemoryService {
  const { registry, ownership } = options;
  const stores = new Map<string, MemoryStore>();

  const memoryDirFor = (sessionId: string | undefined): string | undefined => {
    if (sessionId === undefined || sessionId.length === 0) return undefined;
    const owner = ownership.resolve(sessionId);
    if (owner === undefined) return undefined;
    return registry.memoryDirFor(owner.botSlug);
  };

  const repositoryFor = (sessionId: string | undefined): MemoryRepositoryInspection | undefined => {
    const memoryDir = memoryDirFor(sessionId);
    return memoryDir === undefined ? undefined : inspectMemoryRepository({ memoryDir });
  };

  const storeForMemoryDir = (memoryDir: string): MemoryStore => {
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

  const storeForSession = (sessionId: string | undefined): MemoryStore | undefined => {
    const memoryDir = memoryDirFor(sessionId);
    if (memoryDir === undefined) return undefined;
    if (inspectMemoryRepository({ memoryDir }).state !== 'ready') return undefined;
    return storeForMemoryDir(memoryDir);
  };

  return {
    memoryDirFor,
    repositoryFor,
    storeForSession,
    storeForAgent: (agent) => storeForSession(agent?.session?.id),
  };
}
