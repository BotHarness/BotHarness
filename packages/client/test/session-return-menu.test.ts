// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: () => null,
  MenuItemButton: ({
    children,
    icon,
    onSelect,
    disabled,
  }: {
    children: ReactNode;
    icon: ReactNode;
    onSelect: () => void;
    disabled?: boolean;
  }) => createElement('button', { type: 'button', disabled, onClick: onSelect }, icon, children),
}));
vi.mock('../src/client/bot-icon.js', () => ({
  BotIcon: () => createElement('span', { 'data-icon': 'bot' }),
}));

import type { SessionBotOwner } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import { SessionOwnerLeading, SessionReturnMenuItem } from '../src/client/session-return-action.js';

const OWNER: SessionBotOwner = {
  botSlug: 'qa-bot',
  displayName: 'QA Bot',
  role: 'assignment',
};

function setup(
  resolveOwner: (sessionId: string, signal: AbortSignal) => Promise<SessionBotOwner | undefined>,
  returnToBot = vi.fn(async (_slug: string) => undefined),
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const setMenuOpen = vi.fn();
  const props = {
    sessionId: 'assignment-1',
    displayTitle: 'Assignment',
    useMenuOpenState: () => [true, setMenuOpen] as const,
    resolveOwner,
    returnToBot,
    t: zhTranslate,
  };
  return {
    host,
    root,
    props,
    returnToBot,
    setMenuOpen,
    async render() {
      await act(async () => root.render(createElement(SessionReturnMenuItem, props as never)));
    },
    async dispose() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

describe('native Session menu return to PersonaBot', () => {
  it('shows no entry for an unowned or Subagent Session', async () => {
    const view = setup(vi.fn(async () => undefined));
    try {
      await view.render();
      expect(view.host.querySelector('button')).toBeNull();
    } finally {
      await view.dispose();
    }
  });

  it('shows the Bot icon and returns the owned Assignment to its DM', async () => {
    const resolver = vi.fn(async () => OWNER);
    const view = setup(resolver);
    try {
      await view.render();
      const button = view.host.querySelector('button');
      expect(button?.textContent).toContain('返回 Bot 私聊');
      expect(button?.querySelector('[data-icon="bot"]')).not.toBeNull();
      await act(async () => button?.click());
      expect(resolver).toHaveBeenCalledWith('assignment-1', expect.any(AbortSignal));
      expect(view.returnToBot).toHaveBeenCalledExactlyOnceWith('qa-bot');
      expect(view.setMenuOpen).toHaveBeenCalledExactlyOnceWith(false);
    } finally {
      await view.dispose();
    }
  });

  it('does not show a previous Session owner while a new lookup is pending', async () => {
    let resolveNext: ((owner: SessionBotOwner | undefined) => void) | undefined;
    const resolver = vi.fn((sessionId: string) =>
      sessionId === 'assignment-1'
        ? Promise.resolve(OWNER)
        : new Promise<SessionBotOwner | undefined>((resolve) => {
            resolveNext = resolve;
          }),
    );
    const view = setup(resolver);
    try {
      await view.render();
      expect(view.host.querySelector('button')).not.toBeNull();
      await act(async () => {
        view.root.render(
          createElement(SessionReturnMenuItem, {
            ...view.props,
            sessionId: 'native-2',
          } as never),
        );
      });
      expect(view.host.querySelector('button')).toBeNull();
      await act(async () => resolveNext?.(undefined));
      expect(view.host.querySelector('button')).toBeNull();
    } finally {
      await view.dispose();
    }
  });
  it('keeps the menu open and shows a localized retry message when navigation fails', async () => {
    const returnToBot = vi.fn(async () => {
      throw new Error('navigation failed');
    });
    const view = setup(
      vi.fn(async () => OWNER),
      returnToBot,
    );
    try {
      await view.render();
      await act(async () => view.host.querySelector('button')?.click());
      expect(view.setMenuOpen).not.toHaveBeenCalled();
      expect(view.host.querySelector('button')?.textContent).toContain('打开私聊失败，请重试');
    } finally {
      await view.dispose();
    }
  });
});

describe('native Session row PersonaBot avatar', () => {
  it('shows the owning Bot avatar only for an owned Session', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const resolver = vi.fn(async (sessionId: string) =>
      sessionId === 'assignment-1' ? OWNER : undefined,
    );
    try {
      await act(async () =>
        root.render(
          createElement(SessionOwnerLeading, {
            sessionId: 'assignment-1',
            resolveOwner: resolver,
            t: zhTranslate,
          } as never),
        ),
      );
      const avatar = host.querySelector('.bh-native-session-owner');
      expect(avatar?.getAttribute('role')).toBe('img');
      expect(avatar?.getAttribute('aria-label')).toContain('QA Bot');
      expect(avatar?.getAttribute('data-state')).toBe('idle');
      await act(async () =>
        root.render(
          createElement(SessionOwnerLeading, {
            sessionId: 'unowned-session',
            resolveOwner: resolver,
            t: zhTranslate,
          } as never),
        ),
      );
      expect(host.querySelector('.bh-native-session-owner')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});
