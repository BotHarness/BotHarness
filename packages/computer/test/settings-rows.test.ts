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
  createComputerSettingsFace,
  type ComputerSettingsScope,
} from '../src/client/settings-rows.js';

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
  it('adopts the scope values and publishes writes optimistically', () => {
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

    prefs.setExportDir('/other');
    expect(prefs.getSnapshot().exportDir).toBe('/other');
    expect(fake.writes).toEqual([{ field: 'exportDir', value: '/other' }]);

    fake.push({ exportDir: '/adopted', idleStopMinutes: 15 });
    expect(prefs.getSnapshot()).toMatchObject({ exportDir: '/adopted', idleStopMinutes: 15 });
    expect(seen.length).toBeGreaterThan(0);
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
