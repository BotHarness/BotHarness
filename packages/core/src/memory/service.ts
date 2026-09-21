import type { PersonaBotRegistry } from '../bots/registry.js';
import type { SessionOwnership } from '../sessions/ownership.js';
import { inspectMemoryRepository, type MemoryRepositoryInspection } from './repository.js';
import { createMemoryStore, type MemoryStore } from './store.js';
import { formatMemoryTree, memoryTreeSignature } from './tree.js';

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
  /**
   * Prompt-stable Memory tree text for one Session: identical bytes while the
   * rendered tree would not change, even when a same-day rewrite moved the
   * file's mtime. Empty when the Session owns no ready repository.
   */
  treeForSession(sessionId: string | undefined): string;
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

  const treeCache = new Map<string, { revision: string; signature: string; text: string }>();

  const treeForSession = (sessionId: string | undefined): string => {
    const store = storeForSession(sessionId);
    if (store === undefined) return '';
    const cached = treeCache.get(store.memoryDir);
    const revision = store.treeRevision();
    if (cached !== undefined && cached.revision === revision) return cached.text;
    const entries = store.tree();
    const signature = memoryTreeSignature(entries);
    if (cached !== undefined && cached.signature === signature) {
      treeCache.set(store.memoryDir, { ...cached, revision });
      return cached.text;
    }
    const text = formatMemoryTree(entries);
    treeCache.set(store.memoryDir, { revision, signature, text });
    return text;
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
    treeForSession,
    storeForSession,
    storeForAgent: (agent) => storeForSession(agent?.session?.id),
  };
}
