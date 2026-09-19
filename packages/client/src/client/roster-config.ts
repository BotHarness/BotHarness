export type SectionSortMode = 'inherit' | 'auto' | 'manual';

/** The global default only chooses between the two concrete orderings; `inherit` is itself the default. */
export type GlobalSortMode = 'auto' | 'manual';

export interface ChannelSectionConfig {
  id: string;
  name: string;
  channels: string[];
  collapsed?: boolean;
  /** Omitted means `inherit` (follow the global default). */
  sortMode?: SectionSortMode;
}

export interface RosterConfig {
  pins: string[];
  sections: ChannelSectionConfig[];
  /** Global default the scopes using `inherit` follow. */
  sortMode: GlobalSortMode;
}

export interface ConfigStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const ROSTER_CONFIG_KEY = 'botharness/roster.json';

function emptyConfig(): RosterConfig {
  return { pins: [], sections: [], sortMode: 'auto' };
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

function parseGlobalSortMode(value: unknown): GlobalSortMode {
  return value === 'manual' ? 'manual' : 'auto';
}

function parseSectionSortMode(value: unknown): SectionSortMode | undefined {
  if (value !== 'inherit' && value !== 'auto' && value !== 'manual') return undefined;
  return value === 'inherit' ? undefined : value;
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
      const sortMode = parseSectionSortMode(raw['sortMode']);
      if (sortMode !== undefined) section.sortMode = sortMode;
      sections.push(section);
    }
  }
  return {
    pins: uniqueStrings(record['pins']),
    sections,
    sortMode: parseGlobalSortMode(record['sortMode']),
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

export function toggleSectionCollapsed(config: RosterConfig, sectionId: string): RosterConfig {
  return {
    ...config,
    sections: config.sections.map((section) =>
      section.id === sectionId ? { ...section, collapsed: section.collapsed !== true } : section,
    ),
  };
}

export function sectionSortMode(section: ChannelSectionConfig): SectionSortMode {
  return section.sortMode ?? 'inherit';
}

export function setGlobalSortMode(config: RosterConfig, mode: GlobalSortMode): RosterConfig {
  if (config.sortMode === mode) return config;
  return { ...config, sortMode: mode };
}

export function setSectionSortMode(
  config: RosterConfig,
  sectionId: string,
  mode: SectionSortMode,
): RosterConfig {
  return {
    ...config,
    sections: config.sections.map((section) => {
      if (section.id !== sectionId) return section;
      if (mode !== 'inherit') return { ...section, sortMode: mode };
      const cleared: ChannelSectionConfig = {
        id: section.id,
        name: section.name,
        channels: section.channels,
      };
      if (section.collapsed === true) cleared.collapsed = true;
      return cleared;
    }),
  };
}

export function defaultStorage(): ConfigStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
