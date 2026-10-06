// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: { children?: ReactNode; disabled?: boolean; onClick?: () => void }) =>
    createElement('button', { disabled: props.disabled, onClick: props.onClick }, props.children),
  Tag: (props: { tone?: string; children?: ReactNode }) =>
    createElement('span', { 'data-tone': props.tone }, props.children),
  MarkdownText: (props: { text: string }) =>
    createElement('div', { 'data-markdown': '' }, props.text),
  Modal: (props: {
    open: boolean;
    title: string;
    description?: string;
    children?: ReactNode;
    footer?: ReactNode;
  }) =>
    props.open
      ? createElement(
          'section',
          { role: 'dialog' },
          createElement('h1', null, props.title),
          createElement('p', null, props.description),
          props.children,
          props.footer,
        )
      : null,
}));

import type { ReleaseNote } from '../../core/src/release/notes.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { zhTranslate, type BotHarnessTranslate } from '../src/client/locale.js';
import { RELEASE_NOTES_SEEN_KEY, ReleaseNotesController } from '../src/client/release-notes.js';
import {
  ReleaseNotesAnnouncement,
  ReleaseSettings,
  releaseUpdateCommand,
} from '../src/client/release-notes-view.js';

const t = zhTranslate as unknown as BotHarnessTranslate;

function note(version: string, entries = 1): ReleaseNote {
  return {
    version,
    date: '2026-10-06',
    summary: { en: `Summary ${version}`, zh: `摘要 ${version}` },
    sections: [
      {
        name: 'Added',
        entries: Array.from({ length: entries }, (_, index) => ({
          en: `Added ${version} #${index}`,
          zh: `新增 ${version} #${index}`,
        })),
      },
    ],
  };
}

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

function bridge(
  version: string,
  releases: (since: string | undefined) => ReleaseNote[],
  update: unknown = { status: 'current', current: version, latest: version },
) {
  return vi.fn<BridgeCall>(async (endpoint, payload) => {
    if (endpoint === 'releaseInfo') {
      const since = typeof payload['since'] === 'string' ? payload['since'] : undefined;
      return { ok: true, value: { version, releases: releases(since) } };
    }
    if (endpoint === 'releaseUpdate') return { ok: true, value: update };
    throw new Error(`unexpected ${endpoint}`);
  });
}

async function render(element: ReturnType<typeof createElement>) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return {
    host,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

describe('ReleaseNotesController', () => {
  it('announces only the installed release on first install and remembers it', async () => {
    const storage = memoryStorage();
    const call = bridge('1.0.1', () => [note('1.0.1')]);
    const controller = new ReleaseNotesController(call, storage);
    await controller.start();
    expect(call).toHaveBeenCalledWith('releaseInfo', {});
    expect(controller.source.getSnapshot().announcement?.map((n) => n.version)).toEqual(['1.0.1']);
    controller.dismiss();
    expect(storage.values.get(RELEASE_NOTES_SEEN_KEY)).toBe('1.0.1');
    expect(controller.source.getSnapshot().announcement).toBeUndefined();
  });

  it('announces every release since the last seen version after an update', async () => {
    const storage = memoryStorage({ [RELEASE_NOTES_SEEN_KEY]: '1.0.1' });
    const call = bridge('1.2.0', (since) =>
      since === '1.0.1' ? [note('1.2.0'), note('1.1.0')] : [],
    );
    const controller = new ReleaseNotesController(call, storage);
    await controller.start();
    expect(call).toHaveBeenCalledWith('releaseInfo', { since: '1.0.1' });
    expect(controller.source.getSnapshot().announcement?.map((n) => n.version)).toEqual([
      '1.2.0',
      '1.1.0',
    ]);
  });

  it('stays quiet for an already seen version, a downgrade or a source build', async () => {
    for (const [installed, seen] of [
      ['1.0.1', '1.0.1'],
      ['1.0.1', '1.2.0'],
      ['0.0.0', undefined],
    ] as const) {
      const storage = memoryStorage(seen === undefined ? {} : { [RELEASE_NOTES_SEEN_KEY]: seen });
      const controller = new ReleaseNotesController(
        bridge(installed, () => []),
        storage,
      );
      await controller.start();
      expect(controller.source.getSnapshot().announcement).toBeUndefined();
      expect(storage.values.get(RELEASE_NOTES_SEEN_KEY)).toBe(seen);
    }
  });

  it('marks a release without notes as seen without announcing it', async () => {
    const storage = memoryStorage({ [RELEASE_NOTES_SEEN_KEY]: '1.0.1' });
    const controller = new ReleaseNotesController(
      bridge('1.0.2', () => []),
      storage,
    );
    await controller.start();
    expect(controller.source.getSnapshot().announcement).toBeUndefined();
    expect(storage.values.get(RELEASE_NOTES_SEEN_KEY)).toBe('1.0.2');
  });

  it('reads an available update with its notes and reports unreachable checks', async () => {
    const available = new ReleaseNotesController(
      bridge('1.0.1', () => [], {
        status: 'available',
        current: '1.0.1',
        latest: '1.1.0',
        releases: [note('1.1.0')],
      }),
      memoryStorage(),
    );
    await available.start();
    await available.checkUpdate();
    expect(available.source.getSnapshot().update).toMatchObject({
      status: 'available',
      latest: '1.1.0',
    });

    const broken = vi.fn<BridgeCall>(async (endpoint) =>
      endpoint === 'releaseInfo'
        ? { ok: true, value: { version: '1.0.1', releases: [] } }
        : { ok: false, error: { code: 'release-unavailable', message: 'down', details: {} } },
    );
    const unreachable = new ReleaseNotesController(broken, memoryStorage());
    await unreachable.start();
    await unreachable.checkUpdate();
    expect(unreachable.source.getSnapshot().update).toEqual({
      status: 'unavailable',
      current: '1.0.1',
    });
  });
});

describe('release notes views', () => {
  it('pops the changelog when Bot mode opens and closes it for good on Got it', async () => {
    const storage = memoryStorage();
    const controller = new ReleaseNotesController(
      bridge('1.0.1', () => [note('1.0.1', 12)]),
      storage,
    );
    const view = await render(createElement(ReleaseNotesAnnouncement, { controller, t }));
    try {
      const dialog = view.host.querySelector('[role="dialog"]');
      expect(dialog?.querySelector('h1')?.textContent).toBe('DeepSeekBot 1.0.1 更新内容');
      expect(dialog?.textContent).toContain('摘要 1.0.1');
      expect(dialog?.querySelector('summary')?.textContent).toBe('v1.0.12026-10-06当前版本12 项');
      expect(dialog?.querySelector('p')?.textContent).toBe(
        '欢迎使用 DeepSeekBot，这是当前版本带来的内容。',
      );
      expect(dialog?.querySelector('details')?.hasAttribute('open')).toBe(true);
      const chips = dialog?.querySelectorAll('[data-release-section="Added"] [data-tone]');
      expect(chips?.length).toBe(12);
      expect(chips?.[0]?.getAttribute('data-tone')).toBe('success');
      expect(chips?.[0]?.textContent).toBe('新增');
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      [...(dialog?.querySelectorAll('button') ?? [])]
        .find((button) => button.textContent === '去官网查看')
        ?.click();
      expect(open).toHaveBeenCalledWith(
        'https://deepseekbot.botharness.ai/changelog/',
        '_blank',
        'noopener,noreferrer',
      );
      open.mockRestore();
      const done = [...(dialog?.querySelectorAll('button') ?? [])].find(
        (button) => button.textContent === '知道了',
      );
      await act(async () => {
        done?.click();
      });
      expect(view.host.querySelector('[role="dialog"]')).toBeNull();
      expect(storage.values.get(RELEASE_NOTES_SEEN_KEY)).toBe('1.0.1');
    } finally {
      view.unmount();
    }
  });

  it('shows the installed version, the update command and the newer notes in Settings', async () => {
    const controller = new ReleaseNotesController(
      bridge('1.0.1', () => [], {
        status: 'available',
        current: '1.0.1',
        latest: '1.1.0',
        releases: [note('1.1.0'), note('1.0.2')],
      }),
      memoryStorage({ [RELEASE_NOTES_SEEN_KEY]: '1.0.1' }),
    );
    const view = await render(
      createElement(ReleaseSettings, { releaseNotes: controller, t } as never),
    );
    try {
      await act(async () => {
        await Promise.resolve();
      });
      expect(view.host.textContent).toContain('当前版本 1.0.1，新版本 1.1.0 可用');
      expect(view.host.querySelector('code')?.textContent).toBe(releaseUpdateCommand('1.1.0'));
      expect(releaseUpdateCommand('1.1.0')).toBe('dsh plugin --profile web add deepseekbot@1.1.0');
      expect(view.host.querySelector('[role="dialog"]')).toBeNull();
      const notes = [...view.host.querySelectorAll('button')].find(
        (button) => button.textContent === '查看新版本内容',
      );
      await act(async () => {
        notes?.click();
      });
      const dialog = view.host.querySelector('[role="dialog"]');
      expect(dialog?.querySelector('h1')?.textContent).toBe('DeepSeekBot 1.1.0 更新内容');
      expect(dialog?.textContent).toContain('新增 1.1.0 #0');
      expect(dialog?.querySelector('summary')?.textContent).toContain('最新');
      const versions = dialog?.querySelectorAll('details');
      expect(versions?.[0]?.hasAttribute('open')).toBe(true);
      expect(versions?.[1]?.hasAttribute('open')).toBe(false);
    } finally {
      view.unmount();
    }
  });
});
