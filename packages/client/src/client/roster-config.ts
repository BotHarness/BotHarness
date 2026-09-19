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

export function parseRosterConfig(value: unknown): RosterConfig {
  if (typeof value !== 'object' || value === null) return emptyConfig();
  const record = value as Record<string, unknown>;
  const sections: ChannelSectionConfig[] = [];
  if (Array.isArray(record['sections'])) {
    for (const entry of record['sections']) {
      if (typeof entry !== 'object' || entry === null) continue;
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
  return { pins: uniqueStrings(record['pins']), sections };
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
