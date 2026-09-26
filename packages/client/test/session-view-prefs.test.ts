import { describe, expect, it } from 'vitest';

import {
  readSessionViewPreference,
  SESSION_VIEW_PREFERENCES_KEY,
  writeSessionViewPreference,
} from '../src/client/session-view-prefs.js';
import type { ConfigStorage } from '../src/client/roster-config.js';

function memoryStorage(): ConfigStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

describe('PersonaBot Session view preferences', () => {
  it('persists scope, layout and workspace collapse independently for each Bot', () => {
    const storage = memoryStorage();
    writeSessionViewPreference(
      'bot-a',
      { scope: 'all', layout: 'workspace', collapsedWorkspaces: ['cwd:/projects/a'] },
      storage,
    );
    writeSessionViewPreference(
      'bot-b',
      { scope: 'current', layout: 'workspace', collapsedWorkspaces: [] },
      storage,
    );
    expect(readSessionViewPreference('bot-a', storage)).toEqual({
      scope: 'all',
      layout: 'workspace',
      collapsedWorkspaces: ['cwd:/projects/a'],
    });
    expect(readSessionViewPreference('bot-b', storage)).toEqual({
      scope: 'current',
      layout: 'workspace',
      collapsedWorkspaces: [],
    });
    expect(readSessionViewPreference('bot-c', storage)).toEqual({
      scope: 'current',
      layout: 'flat',
      collapsedWorkspaces: [],
    });
  });

  it('falls back safely when storage is malformed or denied', () => {
    const storage = memoryStorage();
    storage.values.set(SESSION_VIEW_PREFERENCES_KEY, '{invalid');
    expect(readSessionViewPreference('bot-a', storage).layout).toBe('flat');
    storage.values.set(
      SESSION_VIEW_PREFERENCES_KEY,
      JSON.stringify({
        'bot-a': {
          scope: 'unexpected',
          layout: 'workspace',
          collapsedWorkspaces: ['cwd:/a', 'cwd:/a', 12],
        },
      }),
    );
    expect(readSessionViewPreference('bot-a', storage)).toEqual({
      scope: 'current',
      layout: 'workspace',
      collapsedWorkspaces: ['cwd:/a'],
    });
    expect(() =>
      writeSessionViewPreference('bot-a', readSessionViewPreference('bot-a', storage), {
        getItem: () => null,
        setItem: () => {
          throw new Error('blocked');
        },
      }),
    ).not.toThrow();
  });
});
