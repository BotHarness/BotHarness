// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({
    children,
    variant: _variant,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) =>
    createElement('button', props, children),
}));
vi.mock('../src/client/modal.js', () => ({
  Modal: ({ children, footer }: { children: ReactNode; footer: ReactNode }) =>
    createElement('div', null, children, footer),
}));
vi.mock('../src/client/messaging-help.js', () => ({
  MessagingHelp: ({ text }: { text: string }) => createElement('button', { title: text }, 'info'),
}));
import { ChannelHistory } from '../src/client/channel-history.js';
import { createActions } from '../src/client/actions.js';
import { createStore } from '../src/client/store.js';
import { zhTranslate } from '../src/client/locale.js';

async function fixture() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const actions = {
    ...createActions(async () => ({ ok: true, value: {} }), createStore()),
    channelHistory: vi.fn(async () => [
      { id: 'group-qa', name: 'Synthetic QA', deletedAt: '2026-10-08T00:00:00.000Z' },
    ]),
    channelHistorySources: vi.fn(async () => ({
      sources: [
        {
          sourceEventId: 'source-qa',
          messageId: 'msg-qa',
          at: '2026-10-08T00:00:00.000Z',
          body: 'synthetic-only',
        },
      ],
    })),
    channelPurgePreview: vi.fn(async () => ({
      token: 'reviewed',
      expiresAt: '2026-10-08T00:05:00.000Z',
      channelId: 'group-qa',
      sourceEventIds: ['source-qa'],
      placements: [{ channelId: 'group-qa', name: 'Synthetic QA', messageId: 'msg-qa' }],
      admissions: [],
      files: [],
      effects: [],
      derivatives: [],
    })),
    channelPurgeConfirm: vi.fn(async () => {
      throw new Error('Scope changed; review again');
    }),
  };
  await act(async () =>
    root.render(createElement(ChannelHistory, { actions, t: zhTranslate, onClose: vi.fn() })),
  );
  const click = async (label: string) => {
    const button = [...host.querySelectorAll('button')].find((b) => b.textContent === label);
    if (!button) throw new Error('Missing button ' + label);
    await act(async () => button.click());
  };
  return {
    host,
    actions,
    click,
    dispose: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
describe('ended Channel history consent', () => {
  it('requires separate source selection and preview, and cancelling never confirms', async () => {
    const f = await fixture();
    try {
      await f.click('查看历史');
      expect(f.host.querySelector<HTMLInputElement>('input')?.checked).toBe(false);
      await act(async () => f.host.querySelector<HTMLInputElement>('input')!.click());
      await f.click('预览内容清除范围');
      expect(f.actions.channelPurgePreview).toHaveBeenCalledWith('group-qa', ['source-qa']);
      expect(f.host.textContent).not.toContain('DSH Session');
      expect(
        [...f.host.querySelectorAll('button')].some((button) =>
          button.title.includes('DSH Session'),
        ),
      ).toBe(true);
      expect(f.host.textContent).toContain('无法撤销');
      expect(f.host.textContent).not.toContain('msg-qa');
      await f.click('取消');
      expect(f.actions.channelPurgeConfirm).not.toHaveBeenCalled();
      expect(f.host.textContent).toContain('synthetic-only');
    } finally {
      await f.dispose();
    }
  });
  it('submits the reviewed scope and discards a stale preview after Host rejection', async () => {
    const f = await fixture();
    try {
      await f.click('查看历史');
      await act(async () => f.host.querySelector<HTMLInputElement>('input')!.click());
      await f.click('预览内容清除范围');
      await f.click('确认永久清除所选正文');
      expect(f.actions.channelPurgeConfirm).toHaveBeenCalledWith(
        'group-qa',
        ['source-qa'],
        'reviewed',
      );
      expect(f.host.querySelector('[role=alert]')?.textContent).toBe('Scope changed; review again');
      expect(f.host.textContent).not.toContain('确认永久清除所选正文');
    } finally {
      await f.dispose();
    }
  });
});
