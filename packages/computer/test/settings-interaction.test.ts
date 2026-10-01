// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronDownOutlineRegular: () => null,
  IconFolderOpenOutlineRegular: () => null,
  Menu: ({ anchor }: { anchor: unknown }) => anchor,
  Switch: () => null,
}));

import {
  ComputerSettingsPrefs,
  ComputerSettingsRows,
  createComputerSettingsFace,
} from '../src/client/settings-rows.js';
import { en, type ComputerKey, type ComputerTranslate } from '../src/client/locale.js';

const t = ((key: ComputerKey, params?: Record<string, unknown>) => {
  let text = en[key];
  for (const [name, value] of Object.entries(params ?? {}))
    text = text.replace(`{${name}}`, String(value));
  return text;
}) as ComputerTranslate;
const disposers: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose();
  vi.unstubAllGlobals();
});

async function mount(pickDirectory?: () => Promise<string | null>) {
  let value = { exportDir: '/old', idleStopMinutes: 30, autoAllowActions: false };
  let listener = () => {};
  const writes: unknown[] = [];
  const prefs = new ComputerSettingsPrefs();
  prefs.attach({
    getSnapshot: () => ({ status: 'ready', writable: true, value }),
    subscribe: (notify) => {
      listener = notify;
      return () => {};
    },
    set: async (field, next) => {
      writes.push({ field, value: next });
      value = { ...value, [field]: next };
      listener();
    },
  });
  const requests: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    requests.push(url);
    return Response.json({ archive: `${value.exportDir}/computer.tar` });
  });
  const face = createComputerSettingsFace({ prefs, pickDirectory });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      createElement(ComputerSettingsRows, {
        ...face,
        t,
      } as Parameters<typeof ComputerSettingsRows>[0]),
    ),
  );
  disposers.push(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  const click = async (label: string) => {
    const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (node) => node.textContent?.trim() === label,
    );
    expect(button, label).toBeDefined();
    await act(async () => button?.click());
  };
  return { container, click, writes, requests, prefs };
}

describe('Computer Settings transfer interaction', () => {
  it('does not write or export until the chosen target is explicitly authorized', async () => {
    const view = await mount(async () => '/picked');
    await view.click('Export to…');
    expect(view.container.textContent).toContain('Export to: /picked');
    expect(view.writes).toEqual([]);
    expect(view.requests).toEqual([]);
    await view.click('Cancel');
    expect(view.prefs.getSnapshot().exportDir).toBe('/old');
    expect(view.writes).toEqual([]);
    await view.click('Export to…');
    await view.click('Authorize and export');
    expect(view.writes).toEqual([{ field: 'exportDir', value: '/picked' }]);
    expect(view.requests).toContain('/api/computer/export');
    expect(view.container.textContent).toContain('Current: /picked');
  });

  it('leaves configuration unchanged when the picker is cancelled', async () => {
    const view = await mount(async () => null);
    await view.click('Export to…');
    expect(view.container.textContent).not.toContain('Authorize and export');
    expect(view.writes).toEqual([]);
    expect(view.requests).toEqual([]);
  });

  it('keeps manual directory entry usable when the native picker fails', async () => {
    const view = await mount(async () => {
      throw new Error('picker unavailable');
    });
    await view.click('Export to…');
    await view.click('Cancel');
    await view.click('Type a path');
    const input = view.container.querySelector<HTMLInputElement>('input[aria-label="Type a path"]');
    expect(input).not.toBeNull();
    expect(input?.value).toBe('/old');
    expect(view.container.textContent).toContain('type a path or use the current directory');
  });
});
