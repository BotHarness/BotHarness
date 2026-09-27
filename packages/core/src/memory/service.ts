import type { PersonaBotRegistry } from '../bots/registry.js';
import { attachOperationalModule, type OperationalDatabaseOwner } from '../database/owner.js';
import type { SessionOwnership } from '../sessions/ownership.js';
import { createMemoryAcceptance, type MemoryAcceptance } from './accepted.js';
import { inspectMemoryRepository, type MemoryRepositoryInspection } from './repository.js';
import { createMemoryStore, type MemoryStore } from './store.js';

export interface MemoryAgentRef {
  session?: { id?: string };
}

export interface MemoryServiceOptions {
  registry: PersonaBotRegistry;
  ownership: SessionOwnership;
  database?: OperationalDatabaseOwner;
  now?: () => Date;
}

export interface MemoryService extends MemoryAcceptance {
  /**
   * Resolve the Memory Repository of the PersonaBot that owns one Session.
   * Ownership is explicit; cwd, workspace membership, and UI selection never
   * decide it. An unknown Session or an unready repository returns undefined
   * rather than a store that would pretend Memory works.
   */
  storeForSession(sessionId: string | undefined): MemoryStore | undefined;
  storeForAgent(agent: MemoryAgentRef | undefined): MemoryStore | undefined;
  /**
   * The Session-frozen persona text for the system prompt. The first assembly
   * snapshots the current PERSONA.md durably; every later assembly, including
   * after a restart or a cold resume, returns those same bytes even when a
   * Human edited the file. Unowned or unready Sessions contribute nothing.
   */
  personaForSession(sessionId: string | undefined): string;
  /**
   * Compaction-boundary persona refresh: compare the current PERSONA.md body
   * against the Session's recorded snapshot and overwrite only on difference.
   * Unowned, unknown-bot, or unready Sessions report no refresh. An empty body
   * follows the same rule as first assembly: a missing file reads as no persona.
   */
  refreshPersonaAfterCompaction(botSlug: string, sessionId: string): { refreshed: boolean };
  /** Explicit repository path for diagnostics and repair surfaces. */
  memoryDirFor(sessionId: string | undefined): string | undefined;
  /** Repository health for the Memory surface; never mutates. */
  repositoryFor(sessionId: string | undefined): MemoryRepositoryInspection | undefined;
}

export function createMemoryService(options: MemoryServiceOptions): MemoryService {
  const { registry, ownership } = options;
  const stores = new Map<string, MemoryStore>();
  const acceptance =
    options.database === undefined
      ? undefined
      : createMemoryAcceptance({
          registry,
          ownership,
          database: attachOperationalModule(options.database, 'memory'),
          ...(options.now === undefined ? {} : { now: options.now }),
        });
  const requireAcceptance = (): MemoryAcceptance => {
    if (acceptance === undefined) throw new Error('Memory acceptance storage is unavailable');
    return acceptance;
  };

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

  const personaForSession = (sessionId: string | undefined): string => {
    if (sessionId === undefined || sessionId.length === 0) return '';
    const recorded = ownership.personaSnapshot(sessionId);
    if (recorded !== undefined) return recorded.body;
    const store = storeForSession(sessionId);
    if (store === undefined) return '';
    const body = store.persona() ?? '';
    const at = (options.now ?? (() => new Date()))().toISOString();
    return ownership.recordPersonaSnapshot(sessionId, body, at).body;
  };

  const refreshPersonaAfterCompaction = (
    botSlug: string,
    sessionId: string,
  ): { refreshed: boolean } => {
    const owner = ownership.resolve(sessionId);
    if (owner === undefined || owner.botSlug !== botSlug) return { refreshed: false };
    const store = storeForSession(sessionId);
    if (store === undefined) return { refreshed: false };
    const current = store.persona() ?? '';
    if (ownership.personaSnapshot(sessionId)?.body === current) return { refreshed: false };
    ownership.refreshPersonaSnapshot(
      sessionId,
      current,
      (options.now ?? (() => new Date()))().toISOString(),
    );
    return { refreshed: true };
  };

  return {
    continueFromCommit: (input) => requireAcceptance().continueFromCommit(input),
    switchBranch: (input) => requireAcceptance().switchBranch(input),
    prepareTurn: (botSlug, sessionId, options) =>
      requireAcceptance().prepareTurn(botSlug, sessionId, options),
    reconcileTurn: (input) => requireAcceptance().reconcileTurn(input),
    takeTurnAnnotation: (input) => requireAcceptance().takeTurnAnnotation(input),
    abortTurn: (botSlug, sessionId) => requireAcceptance().abortTurn(botSlug, sessionId),
    snapshot: (botSlug) => requireAcceptance().snapshot(botSlug),
    readAccepted: (botSlug, path) => requireAcceptance().readAccepted(botSlug, path),
    history: (botSlug, limit) => requireAcceptance().history(botSlug, limit),
    diff: (botSlug, sha) => requireAcceptance().diff(botSlug, sha),
    gitGraph: (botSlug, offset) => requireAcceptance().gitGraph(botSlug, offset),
    gitCommitDiff: (botSlug, sha) => requireAcceptance().gitCommitDiff(botSlug, sha),
    saveHuman: (input) => requireAcceptance().saveHuman(input),
    repairHuman: (input) => requireAcceptance().repairHuman(input),
    memoryDirFor,
    repositoryFor,
    personaForSession,
    refreshPersonaAfterCompaction,
    storeForSession,
    storeForAgent: (agent) => storeForSession(agent?.session?.id),
  };
}
