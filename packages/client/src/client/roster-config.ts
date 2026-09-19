import { isBotModeSortMode, type BotModeSortMode } from '../bot-mode-settings.js';
import { reconcileOrder } from './roster-order.js';

export interface ChannelSectionConfig {
  id: string;
  name: string;
  channels: string[];
  collapsed?: boolean;
}

export interface RosterConfig {
  pins: string[];
  sections: ChannelSectionConfig[];
}

export interface ConfigStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Legacy browser sort preference exported from `roster.json` before #68. */
export interface LegacySortPreference {
  /** Global default, when the legacy key stored one. */
  global?: BotModeSortMode;
  /** Per-section modes by legacy section id; `inherit` was stored as absence. */
  sections: Record<string, BotModeSortMode>;
}

export const ROSTER_CONFIG_KEY = 'botharness/roster.json';

function emptyConfig(): RosterConfig {
  return { pins: [], sections: [] };
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length === 0 || seen.has(entry)) continue;
    seen.add(entry);
    result.push(entry);
  }
  return result;
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

export function parseRosterConfig(value: unknown): RosterConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return emptyConfig();
  const record = value as Record<string, unknown>;
  const sections: ChannelSectionConfig[] = [];
  if (Array.isArray(record['sections'])) {
    for (const entry of record['sections']) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
      const raw = entry as Record<string, unknown>;
      const id = raw['id'];
      const name = raw['name'];
      if (typeof id !== 'string' || id.length === 0) continue;
      if (typeof name !== 'string' || name.trim().length === 0) continue;
      const section: ChannelSectionConfig = {
        id,
        name: name.trim(),
        channels: uniqueStrings(raw['channels']),
      };
      if (raw['collapsed'] === true) section.collapsed = true;
      sections.push(section);
    }
  }
  return {
    pins: uniqueStrings(record['pins']),
    sections,
  };
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

export function saveRosterConfig(config: RosterConfig, storage: ConfigStorage | undefined): void {
  if (storage === undefined) return;
  try {
    storage.setItem(ROSTER_CONFIG_KEY, JSON.stringify(config));
  } catch {
    return;
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

/** Drop the legacy sort fields, leaving pins/sections for their own migration. */
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

export function addSection(config: RosterConfig, name: string): RosterConfig {
  const trimmed = name.trim();
  if (trimmed.length === 0) return config;
  const taken = new Set(config.sections.map((section) => section.id));
  let counter = config.sections.length + 1;
  while (taken.has(`section-${counter}`)) counter += 1;
  return {
    ...config,
    sections: [...config.sections, { id: `section-${counter}`, name: trimmed, channels: [] }],
  };
}

export function renameSection(config: RosterConfig, sectionId: string, name: string): RosterConfig {
  const trimmed = name.trim();
  if (trimmed.length === 0) return config;
  return {
    ...config,
    sections: config.sections.map((section) =>
      section.id === sectionId ? { ...section, name: trimmed } : section,
    ),
  };
}

export function removeSection(config: RosterConfig, sectionId: string): RosterConfig {
  const sections = config.sections.filter((section) => section.id !== sectionId);
  if (sections.length === config.sections.length) return config;
  return { ...config, sections };
}

export function addChannelToSection(
  config: RosterConfig,
  sectionId: string,
  channelId: string,
): RosterConfig {
  const target = config.sections.find((section) => section.id === sectionId);
  if (target === undefined || target.channels.includes(channelId)) return config;
  return {
    ...config,
    sections: config.sections.map((section) =>
      section.id === sectionId
        ? { ...section, channels: [...section.channels, channelId] }
        : section,
    ),
  };
}

/**
 * Replace one section's channel order — the manual-order seam for #55. Until
 * #66 moves the arrangement into the `botharness_roster` host domain, the
 * section's `channels` array is the frozen manual order; #66 reroutes this
 * write to the bridge. Membership is preserved: ids the caller omits stay at
 * the end in their previous order.
 */
export function setSectionChannelOrder(
  config: RosterConfig,
  sectionId: string,
  order: readonly string[],
): RosterConfig {
  const section = config.sections.find((candidate) => candidate.id === sectionId);
  if (section === undefined) return config;
  const next = reconcileOrder(order, section.channels);
  const unchanged =
    next.length === section.channels.length &&
    next.every((id, index) => id === section.channels[index]);
  if (unchanged) return config;
  return {
    ...config,
    sections: config.sections.map((candidate) =>
      candidate.id === sectionId ? { ...candidate, channels: next } : candidate,
    ),
  };
}

export function toggleSectionCollapsed(config: RosterConfig, sectionId: string): RosterConfig {
  return {
    ...config,
    sections: config.sections.map((section) =>
      section.id === sectionId ? { ...section, collapsed: section.collapsed !== true } : section,
    ),
  };
}

export function defaultStorage(): ConfigStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
