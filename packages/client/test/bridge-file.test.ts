// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { BridgeFile } from '../src/client/bridge-file.js';
import { zhTranslate } from '../src/client/locale.js';
let changed: () => void;
vi.mock('../src/client/messaging-defaults-live.js', () => ({
  subscribeMessagingDefaults: (fn: () => void) => {
    changed = fn;
    return () => {};
  },
}));
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  FileTypeIcon: () => null,
  Menu: ({
    open,
    items,
    onSelect,
  }: {
    open: boolean;
    items: { id: string; label?: string; text?: string }[];
    onSelect(id: string): void;
  }) =>
    open
      ? createElement(
          'div',
          { role: 'menu' },
          items.map((item) =>
            item.label
              ? createElement(
                  'button',
                  { key: item.id, onClick: () => onSelect(item.id) },
                  item.label,
                )
              : item.text,
          ),
        )
      : null,
}));
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0)) await fn();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function render(actions?: Parameters<typeof BridgeFile>[0]['actions']) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  cleanups.push(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  await act(async () =>
    root.render(
      createElement(BridgeFile, {
        channelId: 'channel',
        sourceEventId: 'source',
        item: { id: 'b'.repeat(64), name: '验收.txt' },
        actions,
        t: zhTranslate,
      }),
    ),
  );
  return container;
}
const fileResponse = () =>
  new Response(new TextEncoder().encode('original bytes'), {
    headers: { 'content-type': 'text/plain' },
  });
it('does not acquire on render, keeps unknown metadata honest, and downloads only on explicit action with Channel selectors', async () => {
  const fetcher = vi.fn(async (_url: string, _input: RequestInit) => fileResponse());
  vi.stubGlobal('fetch', fetcher);
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:file'), revokeObjectURL: vi.fn() });
  const container = await render();
  expect(fetcher).not.toHaveBeenCalled();
  expect(container.textContent).toContain('类型未知 · 大小未知');
  await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]?.[0]).toContain('channelId=channel');
  expect(fetcher.mock.calls[0]?.[0]).not.toContain('slug=');
  expect(click).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain('14 字节');
});
it('shows refused/retry states and uses the existing unsupported-open fallback without automatic opening', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 403 }))
    .mockResolvedValue(fileResponse());
  vi.stubGlobal('fetch', fetcher);
  const actions = {
    channelMediaApplications: vi.fn(async () => ({ available: false, applications: [] })),
    channelMediaOpen: vi.fn(async () => {}),
  };
  const container = await render(actions);
  await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
  expect(container.textContent).toContain('文件来源当前不可访问');
  expect(container.textContent).toContain('重试下载');
  await act(async () => container.querySelectorAll<HTMLButtonElement>('button')[1]!.click());
  expect(actions.channelMediaApplications).toHaveBeenCalledWith(
    'channel',
    'source',
    'b'.repeat(64),
  );
  expect(container.querySelector('[role=menu]')?.textContent).toContain('下载');
  expect(actions.channelMediaOpen).not.toHaveBeenCalled();
});
it('cancels a stalled action when current media authority changes', async () => {
  let signal: AbortSignal | undefined;
  const fetcher = vi.fn(
    (_url: string, input: RequestInit) =>
      new Promise((_resolve, reject) => {
        signal = input.signal ?? undefined;
        signal?.addEventListener('abort', () => reject(new Error('cancelled')));
      }),
  );
  vi.stubGlobal('fetch', fetcher);
  const container = await render();
  await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
  expect(container.textContent).toContain('正在获取原文件');
  await act(async () => changed());
  expect(signal?.aborted).toBe(true);
  expect(container.textContent).not.toContain('正在获取原文件');
});
