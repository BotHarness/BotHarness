import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  return {
    IconChevronDownOutline14: stub,
    IconFolderOpenOutline16: stub,
    Menu: stub,
  };
});

import {
  ComputerSettingsPrefs,
  ExportDirRejectedError,
  createComputerSettingsFace,
  displayExportDir,
  type ComputerSettingsScope,
} from '../src/client/settings-rows.js';
import { PHASE_LABEL } from '../src/client/locale.js';

function fakeScope(value: { exportDir: string; idleStopMinutes: number } | undefined): {
  scope: ComputerSettingsScope;
  writes: { field: string; value: unknown }[];
  push: (next: { exportDir: string; idleStopMinutes: number } | undefined) => void;
} {
  const writes: { field: string; value: unknown }[] = [];
  let listener: (() => void) | undefined;
  let current = value;
  return {
    writes,
    scope: {
      getSnapshot: () => ({ status: 'ready', value: current, writable: true }),
      subscribe: (next: () => void) => {
        listener = next;
        return () => {
          listener = undefined;
        };
      },
      set: async (field: string, next: unknown) => {
        writes.push({ field, value: next });
      },
    },
    push: (next) => {
      current = next;
      listener?.();
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('computer settings prefs', () => {
  it('adopts the scope values and publishes writes optimistically', async () => {
    const fake = fakeScope({ exportDir: '/exports', idleStopMinutes: 60 });
    const prefs = new ComputerSettingsPrefs();
    const seen: string[] = [];
    prefs.subscribe(() => seen.push(prefs.getSnapshot().exportDir));
    prefs.attach(fake.scope);

    expect(prefs.getSnapshot()).toMatchObject({
      exportDir: '/exports',
      idleStopMinutes: 60,
      status: 'ready',
      writable: true,
    });

    await prefs.setExportDir('/other');
    expect(prefs.getSnapshot().exportDir).toBe('/other');
    expect(fake.writes).toEqual([{ field: 'exportDir', value: '/other' }]);

    fake.push({ exportDir: '/adopted', idleStopMinutes: 15 });
    expect(prefs.getSnapshot()).toMatchObject({ exportDir: '/adopted', idleStopMinutes: 15 });
    expect(seen.length).toBeGreaterThan(0);
  });

  it('rejects setExportDir when the scope write fails, so the row can show the error', async () => {
    const fake = fakeScope({ exportDir: '/exports', idleStopMinutes: 30 });
    fake.scope.set = async () => {
      throw new Error('scope refused');
    };
    const prefs = new ComputerSettingsPrefs();
    prefs.attach(fake.scope);

    await expect(prefs.setExportDir('/other')).rejects.toThrow('scope refused');
  });

  it('rejects setExportDir when the Host silently recovers to the previous value', async () => {
    // The real DSH scope resolves even on a refused write; the recovery read
    // rolling the snapshot back is the only signal that nothing was stored.
    const fake = fakeScope({ exportDir: '/exports', idleStopMinutes: 30 });
    const prefs = new ComputerSettingsPrefs();
    prefs.attach(fake.scope);
    fake.scope.set = async () => {
      fake.push({ exportDir: '/exports', idleStopMinutes: 30 });
    };

    await expect(prefs.setExportDir('/other')).rejects.toThrow(ExportDirRejectedError);
    expect(prefs.getSnapshot().exportDir).toBe('/exports');
  });
});

describe('displayExportDir', () => {
  it('prefers the configured scope value', () => {
    expect(displayExportDir('/configured', '/host-resolved')).toBe('/configured');
  });

  it('falls back to the Host-resolved path while the scope is empty', () => {
    expect(displayExportDir('', '/Users/me/Desktop/BotHarness Exports')).toBe(
      '/Users/me/Desktop/BotHarness Exports',
    );
    expect(displayExportDir('', undefined)).toBe('');
  });
});

describe('computer settings face', () => {
  it('authorizes export and import and reads the archive list', async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const body =
        url === '/api/computer/export'
          ? { ok: true, archive: '/exports/a.tar' }
          : url === '/api/computer/exports'
            ? { ok: true, files: ['a.tar'] }
            : url === '/api/computer/status'
              ? { exportDir: '/exports' }
              : { ok: true };
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });
    const prefs = new ComputerSettingsPrefs();
    const face = createComputerSettingsFace({ prefs });

    expect(await face.exportArchive()).toBe('/exports/a.tar');
    await face.importArchive('a.tar');
    expect(await face.listArchives()).toEqual(['a.tar']);
    expect(await face.hostExportDir()).toBe('/exports');
    expect(await face.pickDirectory()).toBeNull();

    const exportCall = calls.find((call) => call.url === '/api/computer/export');
    expect(JSON.parse(String(exportCall?.init?.body))).toEqual({ authorize: true });
    const importCall = calls.find((call) => call.url === '/api/computer/import');
    expect(JSON.parse(String(importCall?.init?.body))).toEqual({
      authorize: true,
      file: 'a.tar',
    });
  });

  it('uses the injected picker when one is available', async () => {
    const face = createComputerSettingsFace({
      prefs: new ComputerSettingsPrefs(),
      pickDirectory: async () => '/picked',
    });
    expect(face.pickerAvailable).toBe(true);
    expect(await face.pickDirectory()).toBe('/picked');
  });

  it('exports into an explicit directory and opens folders', async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true, archive: '/target/a.tar' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });
    const face = createComputerSettingsFace({ prefs: new ComputerSettingsPrefs() });

    expect(await face.exportArchive('/target')).toBe('/target/a.tar');
    await face.openDirectory('/target');

    const exportCall = calls.find((call) => call.url === '/api/computer/export');
    expect(JSON.parse(String(exportCall?.init?.body))).toEqual({
      authorize: true,
      dir: '/target',
    });
    const openCall = calls.find((call) => call.url === '/api/computer/open-dir');
    expect(JSON.parse(String(openCall?.init?.body))).toEqual({ authorize: true, dir: '/target' });
    expect(face.pickerAvailable).toBe(false);
  });
});

describe('transfer phase labels', () => {
  it('labels every transfer phase the Host can report', () => {
    expect(PHASE_LABEL.exporting).toBe('entry.phase.exporting');
    expect(PHASE_LABEL.importing).toBe('entry.phase.importing');
    expect(PHASE_LABEL.stopping).toBe('entry.phase.stopping');
    expect(PHASE_LABEL.starting).toBe('entry.phase.starting');
    expect(PHASE_LABEL.pulling).toBe('entry.phase.pulling');
    expect(PHASE_LABEL.unknown).toBeUndefined();
  });
});
