// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: { children?: ReactNode; disabled?: boolean; onClick?: () => void }) =>
    createElement('button', { disabled: props.disabled, onClick: props.onClick }, props.children),
  Input: (props: Record<string, unknown>) => createElement('input', props),
  Tag: (props: { children?: ReactNode }) => createElement('span', null, props.children),
  Modal: (props: {
    title: string;
    description?: string;
    children?: ReactNode;
    footer?: ReactNode;
  }) =>
    createElement(
      'section',
      null,
      createElement('h1', null, props.title),
      createElement('p', null, props.description),
      props.children,
      props.footer,
    ),
}));

vi.mock('../src/client/avatar.js', () => ({
  PersonaBotAvatar: (props: { name: string }) =>
    createElement('span', { 'data-avatar': props.name }),
}));

import type { MarketplaceEntry, MarketplacePage } from '../../core/src/marketplace/client.js';
import type { BridgeActions } from '../src/client/actions.js';
import { BridgeCallError } from '../src/client/bridge.js';
import { MarketplaceModal } from '../src/client/marketplace.js';

function entry(name: string, overrides: Partial<MarketplaceEntry> = {}): MarketplaceEntry {
  return {
    id: `R_${name}`,
    owner: 'alice',
    name,
    fullName: `alice/${name}`,
    description: `${name} description`,
    topics: ['writing'],
    stars: 7,
    pushedAt: '2026-10-01T08:00:00Z',
    htmlUrl: `https://github.com/alice/${name}`,
    cloneUrl: `https://github.com/alice/${name}.git`,
    defaultBranch: 'main',
    headCommit: {
      sha: '0123456789abcdef0123456789abcdef01234567',
      committedAt: '2026-09-30T12:00:00Z',
    },
    ...overrides,
  };
}

interface Harness {
  host: HTMLDivElement;
  list: ReturnType<typeof vi.fn<(cursor?: string) => Promise<MarketplacePage>>>;
  submit: ReturnType<typeof vi.fn<(url: string) => Promise<MarketplaceEntry>>>;
  createBot: ReturnType<typeof vi.fn<() => Promise<unknown>>>;
  onInstalled: ReturnType<typeof vi.fn<() => void>>;
}

async function withMarketplace(
  pages: (cursor?: string) => Promise<MarketplacePage>,
  test: (harness: Harness) => Promise<void>,
  submit: (url: string) => Promise<MarketplaceEntry> = async () => entry('pasted'),
  createBot: () => Promise<unknown> = async () => undefined,
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const harness: Harness = {
    host,
    list: vi.fn(pages),
    submit: vi.fn(submit),
    createBot: vi.fn(createBot),
    onInstalled: vi.fn(),
  };
  try {
    await act(async () =>
      root.render(
        createElement(MarketplaceModal, {
          actions: {
            marketplaceList: harness.list,
            marketplaceSubmit: harness.submit,
            createBot: harness.createBot,
          } as unknown as BridgeActions,
          t: (await import('../src/client/locale.js')).zhTranslate,
          onClose: vi.fn(),
          onInstalled: harness.onInstalled,
        }),
      ),
    );
    await test(harness);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
}

function button(host: HTMLElement, label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((item) => item.textContent === label);
  if (found === undefined) throw new Error(`missing button ${label}`);
  return found;
}

async function click(host: HTMLElement, label: string, index = 0) {
  const matches = [...host.querySelectorAll('button')].filter((item) => item.textContent === label);
  await act(async () => matches[index]?.click());
}

async function typeUrl(host: HTMLElement, value: string) {
  const input = host.querySelector<HTMLInputElement>('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('Bot Marketplace modal', () => {
  it('lists indexed repositories and loads the next page with the cursor', async () => {
    await withMarketplace(
      async (cursor) =>
        cursor === undefined
          ? { bots: [entry('first')], nextCursor: 'page-2' }
          : { bots: [entry('second')] },
      async ({ host, list }) => {
        expect(host.textContent).toContain('Bot 市场');
        expect(host.textContent).toContain('first description');
        expect(host.textContent).toContain('★ 7');
        expect(host.textContent).toContain('更新于 2026-10-01');
        expect(host.textContent).toContain('writing');

        await click(host, '加载更多');

        expect(list).toHaveBeenLastCalledWith('page-2');
        expect(
          [...host.querySelectorAll('[data-market-bot]')].map((row) =>
            row.getAttribute('data-market-bot'),
          ),
        ).toEqual(['alice/first', 'alice/second']);
        expect(host.textContent).not.toContain('加载更多');
      },
    );
  });

  it('shows an empty state and lists a pasted repository at the top', async () => {
    await withMarketplace(
      async () => ({ bots: [] }),
      async ({ host, submit }) => {
        expect(host.textContent).toContain('还没有收录的 Bot');

        await typeUrl(host, ' https://github.com/alice/pasted ');
        await click(host, '收录');

        expect(submit).toHaveBeenCalledWith('https://github.com/alice/pasted');
        expect(host.textContent).toContain('已收录 alice/pasted');
        expect(host.querySelector('[data-market-bot]')?.getAttribute('data-market-bot')).toBe(
          'alice/pasted',
        );
      },
    );
  });

  it('explains why a pasted repository was refused', async () => {
    await withMarketplace(
      async () => ({ bots: [] }),
      async ({ host }) => {
        await typeUrl(host, 'https://github.com/alice/plain');
        await click(host, '收录');

        expect(host.querySelector('[role="alert"]')?.textContent).toContain('botharness-bot 话题');
      },
      async () => {
        throw new BridgeCallError('repository-missing-topic', 'repository-missing-topic');
      },
    );
  });

  it('offers retry when the Marketplace is unreachable', async () => {
    let calls = 0;
    await withMarketplace(
      async () => {
        calls += 1;
        if (calls === 1) throw new BridgeCallError('marketplace-unavailable', 'offline');
        return { bots: [entry('back')] };
      },
      async ({ host }) => {
        expect(host.textContent).toContain('Bot 市场暂时无法访问');

        await click(host, '重试');

        expect(host.textContent).toContain('back description');
      },
    );
  });

  it('confirms with commit time, short SHA and the risk notice before installing through Git', async () => {
    await withMarketplace(
      async () => ({ bots: [entry('helper')] }),
      async ({ host, createBot, onInstalled }) => {
        await click(host, '安装');

        expect(host.querySelector('h1')?.textContent).toBe('安装 helper');
        expect(host.querySelector('[data-market-commit]')?.textContent).toBe(
          '0123456 · 2026-09-30',
        );
        expect(host.textContent).toContain('这是第三方仓库');
        expect(host.textContent).toContain('只安装你信任的仓库');
        expect(createBot).not.toHaveBeenCalled();

        await click(host, '确认安装');

        expect(createBot).toHaveBeenCalledWith({
          displayName: 'helper',
          gitUrl: 'https://github.com/alice/helper.git',
          roles: [],
          description: 'helper description',
        });
        expect(onInstalled).toHaveBeenCalledOnce();
      },
    );
  });

  it('keeps the confirmation open with the clone error when install fails', async () => {
    await withMarketplace(
      async () => ({ bots: [entry('helper', { description: null, headCommit: null })] }),
      async ({ host, createBot, onInstalled }) => {
        await click(host, '安装');
        expect(host.querySelector('[data-market-commit]')?.textContent).toBe('未知');

        await click(host, '确认安装');

        expect(createBot).toHaveBeenCalledWith({
          displayName: 'helper',
          gitUrl: 'https://github.com/alice/helper.git',
          roles: [],
        });
        expect(onInstalled).not.toHaveBeenCalled();
        expect(host.querySelector('[role="alert"]')?.textContent).toContain('克隆失败');

        await click(host, '返回');
        expect(button(host, '安装')).toBeDefined();
      },
      undefined,
      async () => {
        throw new BridgeCallError('git-clone-failed', 'secret detail');
      },
    );
  });
});
