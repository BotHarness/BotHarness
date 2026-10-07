// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: ButtonHTMLAttributes<HTMLButtonElement>) => createElement('button', props),
  Tag: ({ children }: PropsWithChildren) => createElement('span', null, children),
}));
import { ImAppsSettings } from '../src/client/im-apps-settings.js';
import { zhTranslate } from '../src/client/locale.js';
import type { ClientStore } from '../src/client/store.js';

it('lists every app with its platform, connection and bound Bot, and opens that Bot', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const call = vi.fn(async () => ({
    ok: true,
    value: {
      apps: [
        {
          providerId: 'dsh-im/slack',
          ref: 's',
          platform: 'slack',
          name: 'Ops Slack',
          fingerprint: 'x',
          connected: false,
        },
        {
          providerId: 'dsh-im/feishu',
          ref: 'b',
          platform: 'feishu',
          name: 'Sales',
          fingerprint: 'y',
          connected: true,
          boundBotSlug: 'ada',
          bindingId: 'b1',
        },
        {
          providerId: 'dsh-im/feishu',
          ref: 'a',
          platform: 'feishu',
          name: 'Support',
          fingerprint: 'z',
          connected: true,
          boundBotSlug: 'ada',
          bindingId: 'b2',
        },
      ],
    },
  }));
  const state = { bots: [{ slug: 'ada', displayName: 'Ada' }] };
  const store = {
    getSnapshot: () => state,
    subscribe: () => () => undefined,
  } as unknown as ClientStore;
  const openBot = vi.fn(async () => undefined);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      createElement(ImAppsSettings, {
        call,
        store,
        openBot,
        t: zhTranslate,
      } as unknown as Parameters<typeof ImAppsSettings>[0]),
    ),
  );
  const rows = [...container.querySelectorAll('tbody tr')].map((row) =>
    [...row.querySelectorAll('td')].map((cell) => cell.textContent),
  );
  expect(rows.map((r) => [r[0], r[2], r[3]])).toEqual([
    ['Sales', '已连接', 'Ada'],
    ['Support', '已连接', 'Ada'],
    ['Ops Slack', '未连接', '未绑定'],
  ]);
  const button = container.querySelector<HTMLButtonElement>('[aria-label="打开 Ada 的私聊"]')!;
  await act(async () => button.click());
  expect(openBot).toHaveBeenCalledWith('ada');
  await act(async () => root.unmount());
  container.remove();
});
