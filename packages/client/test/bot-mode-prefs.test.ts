import { describe, expect, it, vi } from 'vitest';

import {
  BotModePrefs,
  botModePrefsFace,
  sectionSortMode,
  type BotModeScope,
  type BotModeScopeSnapshot,
} from '../src/client/bot-mode-prefs.js';
import { ROSTER_CONFIG_KEY, type ConfigStorage } from '../src/client/roster-config.js';

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

function stored(storage: ConfigStorage): unknown {
  const raw = storage.getItem(ROSTER_CONFIG_KEY);
  return raw === null ? undefined : JSON.parse(raw);
}

function fakeHost(initial: Partial<BotModeScopeSnapshot> = {}) {
  let snapshot: BotModeScopeSnapshot = {
    status: 'ready',
    value: { sortMode: 'updated', sortModes: {} },
    user: {},
    writable: true,
    mode: 'host',
    ...initial,
  };
  const listeners = new Set<() => void>();
  const set = vi.fn(async (_field: string, _value: unknown) => undefined);
  const mutate = vi.fn(async (_ops: readonly unknown[]) => undefined);
  const host: BotModeScope = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set,
    mutate,
  };
  return {
    host,
    set,
    mutate,
    push(next: Partial<BotModeScopeSnapshot>) {
      snapshot = { ...snapshot, ...next };
      for (const listener of listeners) listener();
    },
  };
}

describe('BOT-mode policy store', () => {
  it('starts on the default without pretending persistence', () => {
    const prefs = new BotModePrefs();

    expect(prefs.source.getSnapshot()).toEqual({
      sortMode: 'updated',
      sortModes: {},
      mode: 'memory',
      status: 'loading',
    });
  });

  it('adopts the accepted Host global and per-section values on every accepted change', () => {
    const scope = fakeHost({
      value: { sortMode: 'manual', sortModes: { s1: 'updated' } },
      user: { sortMode: 'manual', sortModes: { s1: 'updated' } },
    });
    const prefs = new BotModePrefs();
    prefs.attach(scope.host);

    expect(prefs.source.getSnapshot()).toEqual({
      sortMode: 'manual',
      sortModes: { s1: 'updated' },
      mode: 'host',
      status: 'ready',
    });

    scope.push({ value: { sortMode: 'updated', sortModes: {} }, user: {} });
    expect(prefs.source.getSnapshot()).toMatchObject({ sortMode: 'updated', sortModes: {} });
  });

  it('publishes an optimistic global value and writes it through the Host scope', () => {
    const scope = fakeHost();
    const prefs = new BotModePrefs();
    prefs.attach(scope.host);

    prefs.setSortMode('manual');
    expect(prefs.source.getSnapshot().sortMode).toBe('manual');
    expect(scope.set).toHaveBeenCalledWith('sortMode', 'manual');

    scope.set.mockClear();
    prefs.setSortMode('manual');
    expect(scope.set).not.toHaveBeenCalled();
  });

  it('writes per-section overrides as path operations and clears back to inherit', () => {
    const scope = fakeHost();
    const prefs = new BotModePrefs();
    prefs.attach(scope.host);

    prefs.setSectionSortMode('s1', 'manual');
    expect(prefs.source.getSnapshot().sortModes).toEqual({ s1: 'manual' });
    expect(scope.mutate).toHaveBeenCalledWith([
      { op: 'set', path: ['sortModes', 's1'], value: 'manual' },
    ]);

    scope.mutate.mockClear();
    prefs.setSectionSortMode('s1', 'manual');
    expect(scope.mutate).not.toHaveBeenCalled();

    prefs.setSectionSortMode('s1', undefined);
    expect(prefs.source.getSnapshot().sortModes).toEqual({});
    expect(scope.mutate).toHaveBeenCalledWith([{ op: 'unset', path: ['sortModes', 's1'] }]);
  });

  it('resolves a section without an override to inherit', () => {
    const snapshot = {
      sortMode: 'updated' as const,
      sortModes: { s1: 'manual' as const },
      mode: 'host' as const,
      status: 'ready' as const,
    };

    expect(sectionSortMode(snapshot, 's1')).toBe('manual');
    expect(sectionSortMode(snapshot, 'missing')).toBe('inherit');
  });

  it('stays usable process-locally while the scope reports memory mode', () => {
    const scope = fakeHost({
      status: 'unavailable',
      value: undefined,
      user: undefined,
      writable: false,
      mode: 'memory',
    });
    const prefs = new BotModePrefs();
    prefs.attach(scope.host);

    expect(prefs.source.getSnapshot()).toMatchObject({
      sortMode: 'updated',
      sortModes: {},
      mode: 'memory',
      status: 'unavailable',
    });

    expect(() => {
      prefs.setSortMode('manual');
      prefs.setSectionSortMode('s1', 'updated');
    }).not.toThrow();
    expect(prefs.source.getSnapshot()).toMatchObject({
      sortMode: 'manual',
      sortModes: { s1: 'updated' },
    });
  });

  it('warns on a rejected write instead of dropping it silently', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const scope = fakeHost();
    scope.host.set = async () => Promise.reject(new Error('offline'));
    const prefs = new BotModePrefs();
    prefs.attach(scope.host);

    prefs.setSortMode('manual');

    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledWith(
        'botharness: failed to persist the BOT-mode sort preference',
        expect.any(Error),
      );
    });
    warn.mockRestore();
  });

  it('detaches without losing the local value', () => {
    const scope = fakeHost();
    const prefs = new BotModePrefs();
    prefs.attach(scope.host);
    prefs.setSortMode('manual');
    prefs.detach();

    scope.push({ value: { sortMode: 'updated', sortModes: {} } });
    expect(prefs.source.getSnapshot().sortMode).toBe('manual');
  });

  it('shares one store and both writers through the slot face factory', () => {
    const scope = fakeHost();
    const prefs = new BotModePrefs();
    prefs.attach(scope.host);
    const face = botModePrefsFace(prefs);

    expect(face.hooks.botModePrefs).toBe(prefs.source);
    face.setSortMode('manual');
    face.setSectionSortMode('s1', 'updated');
    expect(prefs.source.getSnapshot()).toMatchObject({
      sortMode: 'manual',
      sortModes: { s1: 'updated' },
    });
  });
});

describe('legacy roster.json sort migration', () => {
  it('moves the global and per-section legacy fields once and cleans the local record', () => {
    const storage = memoryStorage(
      JSON.stringify({
        pins: ['ada'],
        sortMode: 'auto',
        sections: [
          { id: 's1', name: 'A', channels: ['c1'], sortMode: 'manual' },
          { id: 's2', name: 'B', channels: [] },
        ],
      }),
    );
    const scope = fakeHost();
    const prefs = new BotModePrefs(storage);
    prefs.attach(scope.host);

    expect(scope.mutate).toHaveBeenCalledWith([
      { op: 'set', path: ['sortMode'], value: 'updated' },
      { op: 'set', path: ['sortModes', 's1'], value: 'manual' },
    ]);
    expect(scope.set).not.toHaveBeenCalled();

    scope.push({ user: { sortMode: 'updated', sortModes: { s1: 'manual' } } });
    expect(stored(storage)).toEqual({
      pins: ['ada'],
      sections: [
        { id: 's1', name: 'A', channels: ['c1'] },
        { id: 's2', name: 'B', channels: [] },
      ],
    });

    const again = fakeHost();
    prefs.attach(again.host);
    expect(again.mutate).not.toHaveBeenCalled();
  });

  it('migrates a per-section-only preference without touching the global field', () => {
    const storage = memoryStorage(
      JSON.stringify({ sections: [{ id: 's1', name: 'A', channels: [], sortMode: 'auto' }] }),
    );
    const scope = fakeHost();
    const prefs = new BotModePrefs(storage);
    prefs.attach(scope.host);

    expect(scope.mutate).toHaveBeenCalledWith([
      { op: 'set', path: ['sortModes', 's1'], value: 'updated' },
    ]);
  });

  it('never overwrites a Host user override and still clears the legacy fields', () => {
    const storage = memoryStorage(
      JSON.stringify({
        sortMode: 'manual',
        sections: [{ id: 's1', name: 'A', channels: [], sortMode: 'manual' }],
      }),
    );
    const scope = fakeHost({
      value: { sortMode: 'updated', sortModes: { s1: 'updated' } },
      user: { sortMode: 'updated', sortModes: { s1: 'updated' } },
    });
    const prefs = new BotModePrefs(storage);
    prefs.attach(scope.host);

    expect(scope.mutate).not.toHaveBeenCalled();
    expect(stored(storage)).toEqual({ sections: [{ id: 's1', name: 'A', channels: [] }] });
  });

  it('leaves the legacy fields alone while the scope is not writable', () => {
    const storage = memoryStorage('{"sortMode":"manual","sections":[]}');
    const scope = fakeHost({ status: 'unavailable', writable: false, mode: 'memory' });
    const prefs = new BotModePrefs(storage);
    prefs.attach(scope.host);

    expect(scope.mutate).not.toHaveBeenCalled();
    expect(stored(storage)).toEqual({ sortMode: 'manual', sections: [] });
  });

  it('keeps the legacy source and warns when the migration write fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const storage = memoryStorage('{"sortMode":"manual","sections":[]}');
    const scope = fakeHost();
    scope.host.mutate = async () => Promise.reject(new Error('offline'));
    const prefs = new BotModePrefs(storage);
    prefs.attach(scope.host);

    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledWith(
        'botharness: failed to persist the BOT-mode sort preference',
        expect.any(Error),
      );
    });
    expect(stored(storage)).toEqual({ sortMode: 'manual', sections: [] });
    warn.mockRestore();
  });

  it('is a no-op when no legacy preference exists', () => {
    const storage = memoryStorage('{"pins":[]}');
    const scope = fakeHost();
    const prefs = new BotModePrefs(storage);
    prefs.attach(scope.host);

    expect(scope.mutate).not.toHaveBeenCalled();
    expect(scope.set).not.toHaveBeenCalled();
    expect(stored(storage)).toEqual({ pins: [] });
  });
});
