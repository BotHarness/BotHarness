import { isBotModeSortMode, type BotModeSortMode } from '../bot-mode-settings.js';
import { uniqueStrings } from './roster.js';

/**
 * Browser-local BOT-mode view state after ADR-0034: only `collapsed` remains
 * here. The durable arrangement (sections/pins/order) lives in the host
 * `botharness_roster` domain and the sort preference in `ui-bot-mode`; the
 * legacy record fields are kept as the one-time migration source.
 */
export interface RosterConfig {
  collapsed: Record<string, boolean>;
}

export interface ConfigStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** One section row as stored by the pre-#66 legacy record. */
export interface LegacyRosterSection {
  id: string;
  name: string;
  channels: string[];
  collapsed?: boolean;
}

/** The legacy arrangement still readable from `roster.json` for migration. */
export interface LegacyRosterArrangement {
  pins: string[];
  sections: LegacyRosterSection[];
}

/** Legacy browser sort preference exported from `roster.json` before #68. */
export interface LegacySortPreference {
  /** Global default, when the legacy key stored one. */
  global?: BotModeSortMode;
  /** Per-section modes by legacy section id; `inherit` was stored as absence. */
  sections: Record<string, BotModeSortMode>;
}

export const ROSTER_CONFIG_KEY = 'botharness/roster.json';

/** One-time copy of the pre-#66 record, written before the live key is cleared. */
export const ROSTER_BACKUP_KEY = 'botharness/roster.json.backup';

/** Marker written after a successful roster migration. */
export const ROSTER_MIGRATED_KEY = 'botharness/roster.migrated';

function emptyConfig(): RosterConfig {
  return { collapsed: {} };
}

function legacyMode(value: unknown): BotModeSortMode | undefined {
  if (value === 'auto') return 'updated';
  return isBotModeSortMode(value) ? value : undefined;
}

function legacyRecord(storage: ConfigStorage | undefined): Record<string, unknown> | undefined {
  if (storage === undefined) return undefined;
  try {
    const raw = storage.getItem(ROSTER_CONFIG_KEY);
    if (raw === null || raw.length === 0) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
    return parsed as Record<string, unknown>;
  } catch {
    // Corrupt storage has no legacy preference to export.
    return undefined;
  }
}

function collapsedMap(value: unknown): Record<string, boolean> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const collapsed: Record<string, boolean> = {};
  for (const [id, flag] of Object.entries(value as Record<string, unknown>)) {
    if (id.length > 0 && flag === true) collapsed[id] = true;
  }
  return collapsed;
}

export function parseRosterConfig(value: unknown): RosterConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return emptyConfig();
  const record = value as Record<string, unknown>;
  const collapsed = collapsedMap(record['collapsed']);
  // A pre-migration record carries collapse state inside its section rows;
  // keep it readable until the migration re-keys it to host section ids.
  if (Array.isArray(record['sections'])) {
    for (const entry of record['sections']) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
      const raw = entry as Record<string, unknown>;
      const id = raw['id'];
      if (typeof id === 'string' && id.length > 0 && raw['collapsed'] === true) {
        collapsed[id] = true;
      }
    }
  }
  return { collapsed };
}

export function loadRosterConfig(storage: ConfigStorage | undefined): RosterConfig {
  if (storage === undefined) return emptyConfig();
  try {
    const raw = storage.getItem(ROSTER_CONFIG_KEY);
    if (raw === null || raw.length === 0) return emptyConfig();
    return parseRosterConfig(JSON.parse(raw));
  } catch {
    return emptyConfig();
  }
}

/**
 * Persist the local view config.
 * @returns `true` when the record was written; `false` on denied storage.
 */
export function saveRosterConfig(
  config: RosterConfig,
  storage: ConfigStorage | undefined,
): boolean {
  if (storage === undefined) return false;
  try {
    storage.setItem(ROSTER_CONFIG_KEY, JSON.stringify(config));
    return true;
  } catch {
    return false;
  }
}

export function toggleSectionCollapsed(config: RosterConfig, sectionId: string): RosterConfig {
  const collapsed = { ...config.collapsed };
  if (collapsed[sectionId] === true) delete collapsed[sectionId];
  else collapsed[sectionId] = true;
  return { collapsed };
}

/**
 * Parse the pre-#66 arrangement out of a legacy record. `undefined` means the
 * record carries nothing worth migrating (already migrated or never had one).
 */
export function parseLegacyRosterArrangement(value: unknown): LegacyRosterArrangement | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const sections: LegacyRosterSection[] = [];
  if (Array.isArray(record['sections'])) {
    for (const entry of record['sections']) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
      const raw = entry as Record<string, unknown>;
      const id = raw['id'];
      const name = raw['name'];
      if (typeof id !== 'string' || id.length === 0) continue;
      if (typeof name !== 'string' || name.trim().length === 0) continue;
      const section: LegacyRosterSection = {
        id,
        name: name.trim(),
        channels: uniqueStrings(raw['channels']),
      };
      if (raw['collapsed'] === true) section.collapsed = true;
      sections.push(section);
    }
  }
  const pins = uniqueStrings(record['pins']);
  if (pins.length === 0 && sections.length === 0) return undefined;
  return { pins, sections };
}

/** Read the legacy arrangement from browser storage, when one is present. */
export function loadLegacyRosterArrangement(
  storage: ConfigStorage | undefined,
): LegacyRosterArrangement | undefined {
  return parseLegacyRosterArrangement(legacyRecord(storage));
}

/**
 * Copy the current live record aside once, before the migration clears it.
 * @returns `true` when the record is backed up or nothing needed backing up;
 *   `false` when storage denied the copy.
 */
export function backupLegacyRoster(storage: ConfigStorage | undefined): boolean {
  if (storage === undefined) return false;
  try {
    const raw = storage.getItem(ROSTER_CONFIG_KEY);
    if (raw === null || raw.length === 0) return true;
    if (storage.getItem(ROSTER_BACKUP_KEY) !== null) return true;
    storage.setItem(ROSTER_BACKUP_KEY, raw);
    return true;
  } catch {
    return false;
  }
}

/** Record that the arrangement migration completed. */
export function markRosterMigrated(storage: ConfigStorage | undefined): void {
  if (storage === undefined) return;
  try {
    storage.setItem(ROSTER_MIGRATED_KEY, new Date().toISOString());
  } catch {
    // The marker is informational; a denied write does not undo the migration.
  }
}

/** Whether this browser already ran the one-shot arrangement migration. */
export function hasRosterMigrated(storage: ConfigStorage | undefined): boolean {
  if (storage === undefined) return false;
  try {
    return storage.getItem(ROSTER_MIGRATED_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Export the legacy global and per-section sort preference. The caller owns
 * the one-shot migration; this helper only reads the roster record shape.
 */
export function readLegacySortPreference(
  storage: ConfigStorage | undefined,
): LegacySortPreference | undefined {
  const record = legacyRecord(storage);
  if (record === undefined) return undefined;
  const global = legacyMode(record['sortMode']);
  const sections: Record<string, BotModeSortMode> = {};
  if (Array.isArray(record['sections'])) {
    for (const entry of record['sections']) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
      const raw = entry as Record<string, unknown>;
      const id = raw['id'];
      if (typeof id !== 'string' || id.length === 0) continue;
      const mode = legacyMode(raw['sortMode']);
      if (mode !== undefined) sections[id] = mode;
    }
  }
  if (global === undefined && Object.keys(sections).length === 0) return undefined;
  return {
    ...(global === undefined ? {} : { global }),
    sections,
  };
}

/** Drop the legacy sort fields, leaving the remaining record for its own migration. */
export function clearLegacySortPreference(storage: ConfigStorage | undefined): void {
  const record = legacyRecord(storage);
  if (record === undefined) return;
  let changed = false;
  if ('sortMode' in record) {
    delete record['sortMode'];
    changed = true;
  }
  if (Array.isArray(record['sections'])) {
    for (const entry of record['sections']) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
      const raw = entry as Record<string, unknown>;
      if ('sortMode' in raw) {
        delete raw['sortMode'];
        changed = true;
      }
    }
  }
  if (!changed) return;
  try {
    storage?.setItem(ROSTER_CONFIG_KEY, JSON.stringify(record));
  } catch {
    // Storage denied: the legacy fields stay and the migration retries on the next load.
  }
}

export function defaultStorage(): ConfigStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
