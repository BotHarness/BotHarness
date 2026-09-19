import { describe, expect, it } from 'vitest';

import {
  backupLegacyRoster,
  clearLegacySortPreference,
  defaultStorage,
  hasRosterMigrated,
  loadLegacyRosterArrangement,
  loadRosterConfig,
  markRosterMigrated,
  parseLegacyRosterArrangement,
  parseRosterConfig,
  readLegacySortPreference,
  ROSTER_BACKUP_KEY,
  ROSTER_CONFIG_KEY,
  ROSTER_MIGRATED_KEY,
  saveRosterConfig,
  toggleSectionCollapsed,
  type ConfigStorage,
  type RosterConfig,
} from '../src/client/roster-config.js';

function memoryStorage(seed?: string): ConfigStorage {
  const values = new Map<string, string>();
  if (seed !== undefined) values.set(ROSTER_CONFIG_KEY, seed);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

function config(patch?: Partial<RosterConfig>): RosterConfig {
  return { collapsed: {}, ...patch };
}

describe('browser roster view config', () => {
  it('keeps only collapsed flags and drops malformed entries', () => {
    const parsed = parseRosterConfig({
      collapsed: { s1: true, s2: false, s3: 'yes', '': true },
      pins: ['ada'],
      sections: [{ id: 's9', name: 'A', channels: [], collapsed: true }],
      sortMode: 'manual',
    });

    expect(parsed).toEqual({ collapsed: { s1: true, s9: true } });
  });

  it('reads collapse state out of a pre-migration record', () => {
    const parsed = parseRosterConfig({
      pins: ['ada'],
      sections: [
        { id: 'section-1', name: 'A', channels: ['c1'], collapsed: true },
        { id: 'section-2', name: 'B', channels: [] },
      ],
    });

    expect(parsed).toEqual({ collapsed: { 'section-1': true } });
  });

  it('falls back to an empty config on unknown shapes', () => {
    expect(parseRosterConfig([])).toEqual({ collapsed: {} });
    expect(parseRosterConfig('nope')).toEqual({ collapsed: {} });
    expect(loadRosterConfig(undefined)).toEqual({ collapsed: {} });
    expect(loadRosterConfig(memoryStorage())).toEqual({ collapsed: {} });
    expect(loadRosterConfig(memoryStorage('{oops'))).toEqual({ collapsed: {} });
  });

  it('round-trips through storage', () => {
    const storage = memoryStorage();
    const stored = config({ collapsed: { s1: true } });

    saveRosterConfig(stored, storage);

    expect(loadRosterConfig(storage)).toEqual(stored);
    expect(JSON.parse(storage.getItem(ROSTER_CONFIG_KEY)!)).toEqual({ collapsed: { s1: true } });
  });

  it('toggles one section without touching the others', () => {
    const base = config({ collapsed: { b: true } });

    const collapsed = toggleSectionCollapsed(base, 'a');
    expect(collapsed.collapsed).toEqual({ b: true, a: true });

    const reopened = toggleSectionCollapsed(collapsed, 'b');
    expect(reopened.collapsed).toEqual({ a: true });
    expect(base.collapsed).toEqual({ b: true });
  });

  it('tolerates a browser without storage', () => {
    expect(defaultStorage()).toBeUndefined();
  });
});

describe('legacy roster arrangement export', () => {
  it('parses trimmed section names, channel order, and collapse flags', () => {
    expect(
      parseLegacyRosterArrangement({
        pins: ['ada', 'ada', 42, '', 'scout'],
        sections: [
          { id: 'section-1', name: ' 研究 ', channels: ['c1', 'c1', 7], collapsed: true },
          { id: '', name: 'blank id', channels: [] },
          { id: 'section-2', name: '   ', channels: [] },
          'not-an-object',
        ],
      }),
    ).toEqual({
      pins: ['ada', 'scout'],
      sections: [{ id: 'section-1', name: '研究', channels: ['c1'], collapsed: true }],
    });
  });

  it('returns undefined when the record has nothing to migrate', () => {
    expect(parseLegacyRosterArrangement(undefined)).toBeUndefined();
    expect(parseLegacyRosterArrangement('nope')).toBeUndefined();
    expect(parseLegacyRosterArrangement([])).toBeUndefined();
    expect(parseLegacyRosterArrangement({ collapsed: { s1: true } })).toBeUndefined();
    expect(parseLegacyRosterArrangement({ pins: [], sections: [] })).toBeUndefined();
    expect(loadLegacyRosterArrangement(memoryStorage('{oops'))).toBeUndefined();
  });

  it('reads the arrangement from browser storage', () => {
    const storage = memoryStorage(
      JSON.stringify({ pins: ['ada'], sections: [{ id: 's1', name: 'A', channels: ['c1'] }] }),
    );

    expect(loadLegacyRosterArrangement(storage)).toEqual({
      pins: ['ada'],
      sections: [{ id: 's1', name: 'A', channels: ['c1'] }],
    });
  });

  it('copies the legacy record aside once before it is cleared', () => {
    const storage = memoryStorage(JSON.stringify({ pins: ['ada'], sections: [] }));
    const legacy = storage.getItem(ROSTER_CONFIG_KEY)!;

    backupLegacyRoster(storage);
    backupLegacyRoster(storage);

    expect(storage.getItem(ROSTER_BACKUP_KEY)).toBe(legacy);
  });

  it('writes and reads the migration marker', () => {
    const storage = memoryStorage();
    expect(hasRosterMigrated(storage)).toBe(false);
    markRosterMigrated(storage);
    expect(storage.getItem(ROSTER_MIGRATED_KEY)).toEqual(expect.any(String));
    expect(hasRosterMigrated(storage)).toBe(true);
    expect(hasRosterMigrated(undefined)).toBe(false);
  });
});

describe('legacy sort preference export', () => {
  it('maps the legacy global and per-section modes to the settings vocabulary', () => {
    const storage = memoryStorage(
      JSON.stringify({
        sortMode: 'auto',
        sections: [
          { id: 's1', name: 'A', channels: [], sortMode: 'manual' },
          { id: 's2', name: 'B', channels: [], sortMode: 'auto' },
          { id: 's3', name: 'C', channels: [], sortMode: 'inherit' },
          { id: 's4', name: 'D', channels: [] },
          { id: 's5', name: 'E', channels: [], sortMode: 'sideways' },
        ],
      }),
    );

    expect(readLegacySortPreference(storage)).toEqual({
      global: 'updated',
      sections: { s1: 'manual', s2: 'updated' },
    });
  });

  it('returns undefined when nothing is worth migrating', () => {
    expect(readLegacySortPreference(undefined)).toBeUndefined();
    expect(readLegacySortPreference(memoryStorage())).toBeUndefined();
    expect(readLegacySortPreference(memoryStorage('{oops'))).toBeUndefined();
    expect(readLegacySortPreference(memoryStorage('[]'))).toBeUndefined();
    expect(
      readLegacySortPreference(memoryStorage('{"sortMode":"sideways","sections":[]}')),
    ).toBeUndefined();
  });

  it('clears every legacy sort field while keeping the remaining record', () => {
    const storage = memoryStorage(
      JSON.stringify({
        pins: ['ada'],
        sortMode: 'manual',
        sections: [
          { id: 's1', name: 'A', channels: ['c1'], sortMode: 'manual', collapsed: true },
          { id: 's2', name: 'B', channels: [], sortMode: 'auto' },
        ],
      }),
    );

    clearLegacySortPreference(storage);

    expect(JSON.parse(storage.getItem(ROSTER_CONFIG_KEY)!)).toEqual({
      pins: ['ada'],
      sections: [
        { id: 's1', name: 'A', channels: ['c1'], collapsed: true },
        { id: 's2', name: 'B', channels: [] },
      ],
    });
  });
});
