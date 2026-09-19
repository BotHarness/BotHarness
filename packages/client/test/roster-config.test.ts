import { describe, expect, it } from 'vitest';

import {
  addSection,
  defaultStorage,
  loadRosterConfig,
  parseRosterConfig,
  ROSTER_CONFIG_KEY,
  saveRosterConfig,
  toggleSectionCollapsed,
  type ConfigStorage,
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

describe('roster display config', () => {
  it('keeps valid pins and sections, dropping malformed entries', () => {
    const config = parseRosterConfig({
      pins: ['ada', 'ada', 42, '', 'scout'],
      sections: [
        { id: 'research', name: ' 研究 ', channels: ['group-lab', 'group-lab', 7] },
        { id: '', name: 'blank id', channels: [] },
        { id: 'no-name', name: '   ', channels: [] },
        { id: 'collapsed', name: '折叠', channels: [], collapsed: true },
        'not-an-object',
      ],
    });

    expect(config).toEqual({
      pins: ['ada', 'scout'],
      sections: [
        { id: 'research', name: '研究', channels: ['group-lab'] },
        { id: 'collapsed', name: '折叠', channels: [], collapsed: true },
      ],
    });
  });

  it('treats missing or corrupt storage as an empty config', () => {
    expect(loadRosterConfig(undefined)).toEqual({ pins: [], sections: [] });
    expect(loadRosterConfig(memoryStorage())).toEqual({ pins: [], sections: [] });
    expect(loadRosterConfig(memoryStorage('{oops'))).toEqual({ pins: [], sections: [] });
    expect(parseRosterConfig('nope')).toEqual({ pins: [], sections: [] });
  });

  it('round-trips through storage', () => {
    const storage = memoryStorage();
    const config = {
      pins: ['ada'],
      sections: [{ id: 'research', name: '研究', channels: ['group-lab'] }],
    };

    saveRosterConfig(config, storage);

    expect(loadRosterConfig(storage)).toEqual(config);
  });

  it('toggles one section without touching the others', () => {
    const config = {
      pins: [],
      sections: [
        { id: 'a', name: 'A', channels: [] },
        { id: 'b', name: 'B', channels: [], collapsed: true },
      ],
    };

    const collapsed = toggleSectionCollapsed(config, 'a');
    expect(collapsed.sections).toEqual([
      { id: 'a', name: 'A', channels: [], collapsed: true },
      { id: 'b', name: 'B', channels: [], collapsed: true },
    ]);

    const reopened = toggleSectionCollapsed(collapsed, 'b');
    expect(reopened.sections[1]).toEqual({ id: 'b', name: 'B', channels: [], collapsed: false });
  });

  it('adds a trimmed empty section with a fresh id', () => {
    const base = {
      pins: [],
      sections: [{ id: 'section-1', name: '既有', channels: ['group-lab'] }],
    };

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
    const config = {
      pins: [],
      sections: [
        { id: 'section-2', name: 'A', channels: [] },
        { id: 'section-3', name: 'B', channels: [] },
      ],
    };

    expect(addSection(config, 'C').sections[2]?.id).toBe('section-4');
    expect(addSection(config, '   ')).toBe(config);
  });

  it('tolerates a browser without storage', () => {
    expect(defaultStorage()).toBeUndefined();
  });
});
