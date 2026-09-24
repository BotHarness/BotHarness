import { createElement, type PropsWithChildren } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  const Tag = ({ children }: PropsWithChildren) => createElement('span', null, children);
  return {
    Button: stub,
    IconAgentPresetOutlineRegular: stub,
    IconChevronDownOutlineRegular: stub,
    IconCloseOutlineRegular: stub,
    IconEllipsisOutlineRegular: stub,
    IconFolderOpenOutlineRegular: stub,
    IconNewChatOutlineRegular: stub,
    IconPlusOutlineRegular: stub,
    IconSearchOutlineRegular: stub,
    IconSendOutlineRegular: stub,
    IconTrashOutlineRegular: stub,
    Input: stub,
    Menu: stub,
    MarkdownText: stub,
    Modal: stub,
    StateDot: stub,
    Tag,
    Tooltip: stub,
    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

import type { BridgeActions } from '../src/client/actions.js';
import { BotMain } from '../src/client/bot-main.js';
import { createChannelSidebarBuiltins } from '../src/client/channel-sidebar-builtins.js';
import { createChannelSidebarRegistry } from '../src/client/channel-sidebar.js';
import { ChannelSidebarEntrySection } from '../src/client/channel-sidebar-view.js';
import { en, zh, type BotHarnessTranslate } from '../src/client/locale.js';
import { store } from '../src/client/store.js';

/** English translate with the same interpolation the framework `t` performs. */
const tEn = ((key: string, params?: Record<string, unknown>): string => {
  let text = (en as Record<string, string>)[key] ?? key;
  for (const [name, value] of Object.entries(params ?? {})) {
    text = text.replace(`{${name}}`, String(value));
  }
  return text;
}) as unknown as BotHarnessTranslate;

describe('localization coverage', () => {
  it('mirrors every Chinese key in the English dictionary', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
    for (const value of Object.values(en)) {
      expect(value.trim()).not.toBe('');
    }
  });

  it('renders Channel sidebar entries in English', () => {
    const entry = createChannelSidebarBuiltins(tEn).find(
      (candidate) => candidate.id === 'assignments',
    );
    expect(entry).toBeDefined();
    const markup = renderToStaticMarkup(
      createElement(ChannelSidebarEntrySection, {
        entry: entry!,
        expanded: true,
        onToggle: () => undefined,
        entryProps: {
          scope: 'personabot',
          channelId: 'dm-ada',
          botSlug: 'ada',
          actions: {} as BridgeActions,
          t: tEn,
        },
      }),
    );
    expect(markup).toContain('Assignments');
  });

  it('renders the empty conversation state in English', () => {
    const registry = createChannelSidebarRegistry();
    for (const builtin of createChannelSidebarBuiltins(tEn)) registry.register(builtin);
    store.setRoster([], []);
    store.select(undefined);
    store.setMode('bot');
    const markup = renderToStaticMarkup(
      createElement(BotMain, {
        actions: {} as BridgeActions,
        channelSidebar: registry,
        t: tEn,
      }),
    );
    expect(markup).toContain('Talk to a PersonaBot');
    expect(markup).toContain('Pick a Bot or channel on the left to start');
  });
});
