import { describe, expect, it } from 'vitest';

import {
  addChannelToSection,
  addSection,
  clearLegacySortPreference,
  defaultStorage,
  loadRosterConfig,
  parseRosterConfig,
  readLegacySortPreference,
  removeSection,
  renameSection,
  ROSTER_CONFIG_KEY,
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
  return { pins: [], sections: [], ...patch };
}

describe('roster display config', () => {
  it('keeps valid pins and sections, dropping malformed entries', () => {
    const parsed = parseRosterConfig({
      pins: ['ada', 'ada', 42, '', 'scout'],
      sections: [
        { id: 'research', name: ' 研究 ', channels: ['group-lab', 'group-lab', 7] },
        { id: '', name: 'blank id', channels: [] },
        { id: 'no-name', name: '   ', channels: [] },
        { id: 'collapsed', name: '折叠', channels: [], collapsed: true },
        'not-an-object',
      ],
    });

    expect(parsed).toEqual({
      pins: ['ada', 'scout'],
      sections: [
        { id: 'research', name: '研究', channels: ['group-lab'] },
        { id: 'collapsed', name: '折叠', channels: [], collapsed: true },
      ],
    });
  });

  it('falls back to defaults on unknown top-level shapes without breaking the roster', () => {
    expect(parseRosterConfig([])).toEqual({ pins: [], sections: [] });
    expect(parseRosterConfig('nope')).toEqual({ pins: [], sections: [] });
    expect(parseRosterConfig({ pins: 'ada', sections: { id: 'x' }, sortMode: 'sideways' })).toEqual(
      {
        pins: [],
        sections: [],
      },
    );
    expect(parseRosterConfig({ sortMode: 'manual', futureKey: { nested: true } })).toEqual({
      pins: [],
      sections: [],
    });
  });

  it('treats missing or corrupt storage as an empty config', () => {
    expect(loadRosterConfig(undefined)).toEqual({ pins: [], sections: [] });
    expect(loadRosterConfig(memoryStorage())).toEqual({ pins: [], sections: [] });
    expect(loadRosterConfig(memoryStorage('{oops'))).toEqual({
      pins: [],
      sections: [],
    });
  });

  it('round-trips through storage', () => {
    const storage = memoryStorage();
    const stored = config({
      pins: ['ada'],
      sections: [{ id: 'research', name: '研究', channels: ['group-lab'] }],
    });

    saveRosterConfig(stored, storage);

    expect(loadRosterConfig(storage)).toEqual(stored);
  });

  it('toggles one section without touching the others', () => {
    const base = config({
      sections: [
        { id: 'a', name: 'A', channels: [] },
        { id: 'b', name: 'B', channels: [], collapsed: true },
      ],
    });

    const collapsed = toggleSectionCollapsed(base, 'a');
    expect(collapsed.sections).toEqual([
      { id: 'a', name: 'A', channels: [], collapsed: true },
      { id: 'b', name: 'B', channels: [], collapsed: true },
    ]);

    const reopened = toggleSectionCollapsed(collapsed, 'b');
    expect(reopened.sections[1]).toEqual({ id: 'b', name: 'B', channels: [], collapsed: false });
  });

  it('adds a trimmed empty section with a fresh id', () => {
    const base = config({
      sections: [{ id: 'section-1', name: '既有', channels: ['group-lab'] }],
    });

    const next = addSection(base, '  新增  ');
    expect(next).toEqual({
      pins: [],
      sections: [
        { id: 'section-1', name: '既有', channels: ['group-lab'] },
        { id: 'section-2', name: '新增', channels: [] },
      ],
    });
    expect(base.sections).toHaveLength(1);
  });

  it('skips taken ids and ignores a blank name', () => {
    const base = config({
      sections: [
        { id: 'section-2', name: 'A', channels: [] },
        { id: 'section-3', name: 'B', channels: [] },
      ],
    });

    expect(addSection(base, 'C').sections[2]?.id).toBe('section-4');
    expect(addSection(base, '   ')).toBe(base);
  });

  it('renames a section with a trimmed name and ignores a blank submit', () => {
    const base = config({
      sections: [
        { id: 'a', name: '旧名', channels: ['group-1'], collapsed: true },
        { id: 'b', name: 'B', channels: [] },
      ],
    });

    const renamed = renameSection(base, 'a', '  新名  ');
    expect(renamed.sections[0]).toEqual({
      id: 'a',
      name: '新名',
      channels: ['group-1'],
      collapsed: true,
    });
    expect(renamed.sections[1]?.name).toBe('B');
    expect(renameSection(base, 'a', '   ')).toBe(base);
  });

  it('removes only the section and leaves its channels to the roster', () => {
    const base = config({
      pins: ['ada'],
      sections: [
        { id: 'a', name: 'A', channels: ['group-1', 'group-2'] },
        { id: 'b', name: 'B', channels: ['group-3'] },
      ],
    });

    const next = removeSection(base, 'a');
    expect(next.sections).toEqual([{ id: 'b', name: 'B', channels: ['group-3'] }]);
    expect(next.pins).toEqual(['ada']);
    expect(removeSection(base, 'missing')).toBe(base);
  });

  it('assigns a created channel to its section once', () => {
    const base = config({ sections: [{ id: 'a', name: 'A', channels: ['group-1'] }] });

    const next = addChannelToSection(base, 'a', 'group-2');
    expect(next.sections[0]?.channels).toEqual(['group-1', 'group-2']);
    expect(addChannelToSection(next, 'a', 'group-2')).toBe(next);
    expect(addChannelToSection(base, 'missing', 'group-9')).toBe(base);
  });

  it('drops sort fields wherever they appear in the roster record', () => {
    const parsed = parseRosterConfig({
      sortMode: 'manual',
      sections: [{ id: 'a', name: 'A', channels: [], sortMode: 'manual' }],
    });

    expect(parsed).toEqual({
      pins: [],
      sections: [{ id: 'a', name: 'A', channels: [] }],
    });
  });

  it('tolerates a browser without storage', () => {
    expect(defaultStorage()).toBeUndefined();
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

  it('exports per-section modes without a legacy global field', () => {
    const storage = memoryStorage(
      JSON.stringify({ sections: [{ id: 's1', name: 'A', channels: [], sortMode: 'manual' }] }),
    );

    expect(readLegacySortPreference(storage)).toEqual({ sections: { s1: 'manual' } });
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

  it('clears every legacy sort field while keeping pins and section rows', () => {
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

    clearLegacySortPreference(storage);
    expect(JSON.parse(storage.getItem(ROSTER_CONFIG_KEY)!).sections[0].sortMode).toBeUndefined();
  });
});
