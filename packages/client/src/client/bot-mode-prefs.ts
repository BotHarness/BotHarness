import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store';

import {
  BOT_MODE_MOTION_FIELD,
  BOT_MODE_SORT_FIELD,
  BOT_MODE_SORT_MODES_FIELD,
  DEFAULT_BOT_MODE_MOTION,
  DEFAULT_BOT_MODE_SORT,
  isBotModeMotionPreference,
  type BotModeSettings,
  type BotModeMotionPreference,
  type BotModeSortMode,
} from '../bot-mode-settings.js';
import {
  resolveEffectiveMotion,
  type EffectiveMotion,
  type SystemMotionSource,
} from './motion-preference.js';
import {
  clearLegacySortPreference,
  readLegacySortPreference,
  type ConfigStorage,
  type LegacySortPreference,
} from './roster-config.js';

/** Path-addressed edit accepted by the settings scope (`set`/`unset` inside the namespace). */
export type BotModePathOp =
  | { op: 'set'; path: readonly string[]; value: unknown }
  | { op: 'unset'; path: readonly string[] };

/** Sync state of the Host settings scope the policy consumes. */
export interface BotModeScopeSnapshot {
  status: 'loading' | 'ready' | 'unavailable';
  value: BotModeSettings | undefined;
  /** Raw user layer; a `sortMode`/`sortModes` key means the user overrode the default. */
  user: unknown;
  writable: boolean;
  /** `memory` keeps writes process-local (non-loopback pages). */
  mode: 'host' | 'memory';
}

/**
 * The subset of the `settingsScope.bind()` result the policy reads and writes.
 * Declared structurally so tests and service-less hosts can substitute it.
 */
export interface BotModeScope {
  getSnapshot(): BotModeScopeSnapshot;
  subscribe(listener: () => void): () => void;
  set(field: string, value: unknown): Promise<void>;
  mutate(ops: readonly BotModePathOp[], expectedRevision?: number): Promise<void>;
}

/** Live BOT-mode preference published to the sidebar menu and the Settings row. */
export interface BotModePrefsSnapshot {
  /** Human-owned preference persisted in the shared settings namespace. */
  motionPreference: BotModeMotionPreference;
  /** Resolved policy every BotHarness motion consumer uses. */
  effectiveMotion: EffectiveMotion;
  /** Current global sort mode; the default before Host settings arrive. */
  sortMode: BotModeSortMode;
  /** Per-section overrides by section id; a missing key follows the global default. */
  sortModes: Record<string, BotModeSortMode>;
  /** `memory` when the page keeps writes process-local. */
  mode: 'host' | 'memory';
  /** Scope sync state; `unavailable` is memory mode or an unserved namespace. */
  status: 'loading' | 'ready' | 'unavailable';
}

/** A section's effective mode: `inherit` follows the global default. */
export type SectionSortMode = 'inherit' | BotModeSortMode;

/** Read one section's effective mode from a published snapshot. */
export function sectionSortMode(
  snapshot: BotModePrefsSnapshot,
  sectionId: string,
): SectionSortMode {
  return snapshot.sortModes[sectionId] ?? 'inherit';
}

/** Registration-side face shared by the sidebar menu and the Settings row. */
export interface BotModePrefsFace {
  hooks: {
    /** Live BOT-mode preference bound as useBotModePrefs. */
    botModePrefs: SnapshotStore<BotModePrefsSnapshot>;
  };
  /** Change the product-level motion preference. */
  setMotionPreference: (preference: BotModeMotionPreference) => void;
  /** Change the global BOT-mode list sort mode. */
  setSortMode: (mode: BotModeSortMode) => void;
  /** Override one section's sort mode; `undefined` returns it to `inherit`. */
  setSectionSortMode: (sectionId: string, mode: BotModeSortMode | undefined) => void;
}

/**
 * Build the one slot face shared by both surfaces, so the sidebar menu and the
 * Settings row can never drift to different stores or write paths.
 */
export function botModePrefsFace(prefs: BotModePrefs): BotModePrefsFace {
  return {
    hooks: { botModePrefs: prefs.source },
    setMotionPreference: (preference) => {
      prefs.setMotionPreference(preference);
    },
    setSortMode: (mode) => {
      prefs.setSortMode(mode);
    },
    setSectionSortMode: (sectionId, mode) => {
      prefs.setSectionSortMode(sectionId, mode);
    },
  };
}

function userField(user: unknown, key: string): Record<string, unknown> | undefined {
  if (typeof user !== 'object' || user === null || Array.isArray(user)) return undefined;
  const field = (user as Record<string, unknown>)[key];
  if (typeof field !== 'object' || field === null || Array.isArray(field)) return undefined;
  return field as Record<string, unknown>;
}

function hasOwn(value: unknown, key: string): boolean {
  return typeof value === 'object' && value !== null && key in value;
}

function legacyMigrationOps(legacy: LegacySortPreference, user: unknown): BotModePathOp[] {
  const ops: BotModePathOp[] = [];
  if (legacy.global !== undefined && !hasOwn(user, BOT_MODE_SORT_FIELD)) {
    ops.push({ op: 'set', path: [BOT_MODE_SORT_FIELD], value: legacy.global });
  }
  const userModes = userField(user, BOT_MODE_SORT_MODES_FIELD) ?? {};
  for (const [id, mode] of Object.entries(legacy.sections)) {
    if (!(id in userModes)) {
      ops.push({ op: 'set', path: [BOT_MODE_SORT_MODES_FIELD, id], value: mode });
    }
  }
  return ops;
}

function legacyApplied(legacy: LegacySortPreference, user: unknown): boolean {
  if (legacy.global !== undefined && !hasOwn(user, BOT_MODE_SORT_FIELD)) return false;
  const userModes = userField(user, BOT_MODE_SORT_MODES_FIELD) ?? {};
  return Object.keys(legacy.sections).every((id) => id in userModes);
}

/**
 * One observable preference over the `ui-bot-mode` settings namespace:
 * optimistic local writes, Host values adopted on snapshot changes, and the
 * legacy `roster.json` global and per-section sort fields migrated once per
 * durable attach.
 */
export class BotModePrefs {
  /** Selector-hook source shared by the sidebar menu and the Settings row. */
  readonly source: SnapshotStore<BotModePrefsSnapshot>;

  private readonly storage: ConfigStorage | undefined;
  private host: BotModeScope | undefined;
  private detachHost: (() => void) | undefined;
  private detachSystemMotion: (() => void) | undefined;
  private systemReduced = false;
  private migration: 'pending' | 'attempted' | 'done' = 'pending';

  /**
   * @param storage - legacy browser storage; the migration source and no longer the authority.
   */
  constructor(storage?: ConfigStorage | undefined) {
    this.storage = storage;
    this.source = createSnapshotStore<BotModePrefsSnapshot>({
      motionPreference: DEFAULT_BOT_MODE_MOTION,
      effectiveMotion: resolveEffectiveMotion(DEFAULT_BOT_MODE_MOTION, this.systemReduced),
      sortMode: DEFAULT_BOT_MODE_SORT,
      sortModes: {},
      mode: 'memory',
      status: 'loading',
    });
  }

  /**
   * Attach the one operating-system preference source used by the policy.
   * @returns cleanup that removes the media-query listener.
   */
  attachSystemMotion(source: SystemMotionSource | undefined): () => void {
    this.detachSystemMotion?.();
    this.detachSystemMotion = undefined;
    this.publishSystemMotion(source?.reduced ?? false);
    if (source === undefined) return () => {};
    const unsubscribe = source.subscribe((reduced) => {
      this.publishSystemMotion(reduced);
    });
    let active = true;
    const detach = (): void => {
      if (!active) return;
      active = false;
      unsubscribe();
      if (this.detachSystemMotion === detach) this.detachSystemMotion = undefined;
    };
    this.detachSystemMotion = detach;
    return detach;
  }

  /** Attach a Host scope, adopting its current value and migrating the legacy fields. */
  attach(host: BotModeScope): void {
    if (this.host === host) return;
    this.detach();
    this.host = host;
    this.migration = 'pending';
    this.detachHost = host.subscribe(() => {
      this.sync();
    });
    this.sync();
  }

  /** Detach the current Host scope; further writes stay local. */
  detach(): void {
    this.detachHost?.();
    this.detachHost = undefined;
    this.host = undefined;
  }

  /** Detach every external source owned by this policy. */
  dispose(): void {
    this.detach();
    this.detachSystemMotion?.();
    this.detachSystemMotion = undefined;
  }

  /** Publish and persist the Human-owned product motion preference. */
  setMotionPreference(preference: BotModeMotionPreference): void {
    if (this.source.getSnapshot().motionPreference === preference) return;
    this.source.update((draft) => {
      draft.motionPreference = preference;
      draft.effectiveMotion = resolveEffectiveMotion(preference, this.systemReduced);
    });
    if (this.host !== undefined) {
      this.persist(this.host.set(BOT_MODE_MOTION_FIELD, preference));
    }
  }

  /**
   * Publish and persist the global sort mode.
   * @param mode - Newest-first (`updated`) or the user's frozen order (`manual`).
   */
  setSortMode(mode: BotModeSortMode): void {
    if (this.source.getSnapshot().sortMode === mode) return;
    this.source.update((draft) => {
      draft.sortMode = mode;
    });
    if (this.host !== undefined) this.persist(this.host.set(BOT_MODE_SORT_FIELD, mode));
  }

  /**
   * Publish and persist one section's sort mode.
   * @param sectionId - Section the mode applies to.
   * @param mode - Override mode, or `undefined` to clear back to `inherit`.
   */
  setSectionSortMode(sectionId: string, mode: BotModeSortMode | undefined): void {
    if (this.source.getSnapshot().sortModes[sectionId] === mode) return;
    this.source.update((draft) => {
      if (mode === undefined) delete draft.sortModes[sectionId];
      else draft.sortModes[sectionId] = mode;
    });
    if (this.host === undefined) return;
    const op: BotModePathOp =
      mode === undefined
        ? { op: 'unset', path: [BOT_MODE_SORT_MODES_FIELD, sectionId] }
        : { op: 'set', path: [BOT_MODE_SORT_MODES_FIELD, sectionId], value: mode };
    this.persist(this.host.mutate([op]));
  }

  /**
   * Re-key per-section sort modes from legacy section ids to the
   * host-generated ids the roster migration created. The accepted Host state
   * wins over a mode still only in the legacy record; the legacy key is
   * cleared and the host key written in one mutation, awaited so the roster
   * migration can roll back when this fails.
   * @param mapping - Legacy section id → host section id.
   * @returns `true` when every mapped mode is persisted (or none needed persisting).
   */
  async remapSectionSortModes(mapping: ReadonlyMap<string, string>): Promise<boolean> {
    const host = this.host;
    const snapshot = this.source.getSnapshot();
    const legacy = readLegacySortPreference(this.storage)?.sections ?? {};
    const modes = new Map<string, BotModeSortMode>(Object.entries(legacy));
    for (const [id, mode] of Object.entries(snapshot.sortModes)) modes.set(id, mode);
    const ops: BotModePathOp[] = [];
    const next = { ...snapshot.sortModes };
    let pending = false;
    for (const [legacyId, hostId] of mapping) {
      const mode = modes.get(legacyId);
      if (mode === undefined) continue;
      if (host === undefined) {
        pending = true;
        continue;
      }
      delete next[legacyId];
      next[hostId] = mode;
      ops.push({ op: 'unset', path: [BOT_MODE_SORT_MODES_FIELD, legacyId] });
      ops.push({ op: 'set', path: [BOT_MODE_SORT_MODES_FIELD, hostId], value: mode });
    }
    if (pending || host === undefined) return false;
    if (ops.length === 0) return true;
    this.source.update((draft) => {
      draft.sortModes = next;
    });
    try {
      await host.mutate(ops);
      return true;
    } catch (error) {
      this.source.update((draft) => {
        draft.sortModes = snapshot.sortModes;
      });
      console.warn('botharness: failed to remap the BOT-mode sort modes', error);
      return false;
    }
  }

  /** Adopt the latest accepted Host section without writing it back. */
  private sync(): void {
    const host = this.host;
    if (host === undefined) return;
    const scope = host.getSnapshot();
    const section = scope.value;
    this.source.update((draft) => {
      draft.status = scope.status;
      draft.mode = scope.mode;
      if (section !== undefined) {
        const motionPreference = isBotModeMotionPreference(section.motionPreference)
          ? section.motionPreference
          : DEFAULT_BOT_MODE_MOTION;
        draft.motionPreference = motionPreference;
        draft.effectiveMotion = resolveEffectiveMotion(motionPreference, this.systemReduced);
        draft.sortMode = section.sortMode;
        draft.sortModes = { ...section.sortModes };
      }
    });
    this.migrate(scope);
  }

  /** Re-resolve a system-following preference after a media-query change. */
  private publishSystemMotion(reduced: boolean): void {
    this.systemReduced = reduced;
    this.source.update((draft) => {
      draft.effectiveMotion = resolveEffectiveMotion(draft.motionPreference, reduced);
    });
  }

  /**
   * Move the legacy `roster.json` global and per-section sort fields into the
   * namespace once. The legacy fields are cleared only after the Host user
   * layer carries every value, so a failed write keeps the migration source
   * for the next load.
   */
  private migrate(scope: BotModeScopeSnapshot): void {
    if (this.migration === 'done' || scope.status !== 'ready' || !scope.writable) return;
    const legacy = readLegacySortPreference(this.storage);
    if (legacy === undefined) {
      this.migration = 'done';
      return;
    }
    if (this.migration === 'attempted') {
      if (legacyApplied(legacy, scope.user)) {
        clearLegacySortPreference(this.storage);
        this.migration = 'done';
      }
      return;
    }
    const ops = legacyMigrationOps(legacy, scope.user);
    if (ops.length === 0) {
      clearLegacySortPreference(this.storage);
      this.migration = 'done';
      return;
    }
    this.migration = 'attempted';
    if (this.host !== undefined) this.persist(this.host.mutate(ops));
  }

  /** Report a write failure instead of dropping it silently. */
  private persist(operation: Promise<void>): void {
    operation.catch((error: unknown) => {
      console.warn('botharness: failed to persist the BOT-mode preference', error);
    });
  }
}
