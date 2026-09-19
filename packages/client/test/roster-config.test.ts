import { describe, expect, it } from 'vitest';

import {
  addChannelToSection,
  addSection,
  defaultStorage,
  loadRosterConfig,
  parseRosterConfig,
  removeSection,
  renameSection,
  ROSTER_CONFIG_KEY,
  saveRosterConfig,
  sectionSortMode,
  setGlobalSortMode,
  setSectionSortMode,
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
  return { pins: [], sections: [], sortMode: 'auto', ...patch };
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
      sortMode: 'auto',
    });
  });

  it('keeps a valid per-section sort mode and drops inherit/unknown values', () => {
    const parsed = parseRosterConfig({
      sections: [
        { id: 'auto', name: 'A', channels: [], sortMode: 'auto' },
        { id: 'manual', name: 'B', channels: [], sortMode: 'manual' },
        { id: 'inherit', name: 'C', channels: [], sortMode: 'inherit' },
        { id: 'junk', name: 'D', channels: [], sortMode: 42 },
      ],
    });

    expect(parsed.sections).toEqual([
      { id: 'auto', name: 'A', channels: [], sortMode: 'auto' },
      { id: 'manual', name: 'B', channels: [], sortMode: 'manual' },
      { id: 'inherit', name: 'C', channels: [] },
      { id: 'junk', name: 'D', channels: [] },
    ]);
  });

  it('falls back to defaults on unknown top-level shapes without breaking the roster', () => {
    expect(parseRosterConfig([])).toEqual({ pins: [], sections: [], sortMode: 'auto' });
    expect(parseRosterConfig('nope')).toEqual({ pins: [], sections: [], sortMode: 'auto' });
    expect(parseRosterConfig({ pins: 'ada', sections: { id: 'x' }, sortMode: 'sideways' })).toEqual(
      {
        pins: [],
        sections: [],
        sortMode: 'auto',
      },
    );
    expect(parseRosterConfig({ sortMode: 'manual', futureKey: { nested: true } })).toEqual({
      pins: [],
      sections: [],
      sortMode: 'manual',
    });
  });

  it('treats missing or corrupt storage as an empty config', () => {
    expect(loadRosterConfig(undefined)).toEqual({ pins: [], sections: [], sortMode: 'auto' });
    expect(loadRosterConfig(memoryStorage())).toEqual({ pins: [], sections: [], sortMode: 'auto' });
    expect(loadRosterConfig(memoryStorage('{oops'))).toEqual({
      pins: [],
      sections: [],
      sortMode: 'auto',
    });
  });

  it('round-trips through storage', () => {
    const storage = memoryStorage();
    const stored = config({
      pins: ['ada'],
      sections: [{ id: 'research', name: '研究', channels: ['group-lab'], sortMode: 'manual' }],
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
      sortMode: 'auto',
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

  it('stores scope sort modes: section default inherits, global default is auto', () => {
    expect(sectionSortMode({ id: 'a', name: 'A', channels: [] })).toBe('inherit');

    const base = config({ sections: [{ id: 'a', name: 'A', channels: [] }] });
    const manual = setSectionSortMode(base, 'a', 'manual');
    expect(manual.sections[0]?.sortMode).toBe('manual');
    expect(sectionSortMode(manual.sections[0]!)).toBe('manual');

    const auto = setSectionSortMode(manual, 'a', 'auto');
    expect(auto.sections[0]?.sortMode).toBe('auto');

    const cleared = setSectionSortMode(auto, 'a', 'inherit');
    expect(cleared.sections[0]).toEqual({ id: 'a', name: 'A', channels: [] });
    expect(sectionSortMode(cleared.sections[0]!)).toBe('inherit');

    const collapsed = config({
      sections: [{ id: 'a', name: 'A', channels: [], collapsed: true, sortMode: 'manual' }],
    });
    expect(setSectionSortMode(collapsed, 'a', 'inherit').sections[0]).toEqual({
      id: 'a',
      name: 'A',
      channels: [],
      collapsed: true,
    });

    expect(setGlobalSortMode(config(), 'manual').sortMode).toBe('manual');
    expect(setGlobalSortMode(config(), 'auto').sortMode).toBe('auto');
    expect(setGlobalSortMode(config({ sortMode: 'manual' }), 'manual').sortMode).toBe('manual');
  });

  it('tolerates a browser without storage', () => {
    expect(defaultStorage()).toBeUndefined();
  });
});
