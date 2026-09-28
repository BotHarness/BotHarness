// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  return {
    Button: stub,
    IconAgentPresetOutlineRegular: stub,
    IconChevronDownOutlineRegular: stub,
    IconChevronRightOutlineRegular: stub,
    IconCloseFill14: stub,
    IconEditOutlineRegular: stub,
    IconEllipsisOutlineRegular: stub,
    IconFolderOpenOutlineRegular: stub,
    IconNewChatOutlineRegular: stub,
    IconTriangleRightFill14: stub,
    IconTrashOutlineRegular: stub,
    IconPlusOutlineRegular: stub,
    IconSearchOutlineRegular: stub,
    IconSettingsOutlineRegular: stub,
    IconSendOutlineRegular: stub,
    Input: stub,
    Menu: stub,
    Modal: stub,
    StateDot: stub,
    Tag: stub,
    Tooltip: stub,
    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

import type { BotModePrefsSnapshot } from '../src/client/bot-mode-prefs.js';
import { createBotPanelEntry } from '../src/client/bot-sidebar.js';
import { store } from '../src/client/store.js';
import {
  zh,
  zhTranslate,
  type BotHarnessKey,
  type BotHarnessTranslate,
} from '../src/client/locale.js';

const useBotModePrefs = ((selector: (value: BotModePrefsSnapshot) => unknown) =>
  selector({
    motionPreference: 'system',
    botIcon: 'mascot' as const,
    developerMode: false,
    effectiveMotion: 'full',
    sortMode: 'updated',
    sortModes: {},
    mode: 'host',
    status: 'ready',
  })) as never;

const t = zhTranslate as unknown as BotHarnessTranslate;
const openSettings = () => undefined;

describe('bot panel entry', () => {
  it('renders the chosen mark in both states', () => {
    const entry = createBotPanelEntry(
      () => undefined,
      () => undefined,
    );
    const inactive = renderToStaticMarkup(
      createElement(entry, { size: 16, active: false, useBotModePrefs, openSettings, t }),
    );
    const active = renderToStaticMarkup(
      createElement(entry, { size: 16, active: true, useBotModePrefs, openSettings, t }),
    );

    // The exit hit layer and the gear live in a portal into the shell row,
    // which only exists in the browser; server rendering shows the mark.
    expect(inactive).toContain('bh-bot-icon');
    expect(active).toContain('bh-bot-icon');
    expect(inactive).toContain('data-wide="true"');
    expect(inactive).not.toContain('bh-panel-glyph-hit');
  });

  it('places one Inbox button beside the shell row and opens it independently', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const onExit = vi.fn();
    const onOpenInbox = vi.fn();
    const nav = document.createElement('nav');
    const plugins = document.createElement('button');
    const bot = document.createElement('button');
    nav.append(plugins, bot);
    document.body.append(nav);
    const root = createRoot(bot);
    const entry = createBotPanelEntry(onExit, onOpenInbox);
    try {
      await act(async () =>
        root.render(
          createElement(entry, { size: 16, active: true, useBotModePrefs, openSettings, t }),
        ),
      );
      const inbox = nav.querySelector<HTMLButtonElement>('.bh-panel-inbox');
      expect(inbox).not.toBeNull();
      expect(inbox?.parentElement).toBe(nav);
      expect(bot.querySelector('.bh-panel-inbox')).toBeNull();
      expect(inbox?.style.gridRow).toBe('2');
      expect(inbox?.getAttribute('aria-label')).toBe(t('humanInbox.title'));
      expect(inbox?.querySelector('svg')).not.toBeNull();

      await act(async () => inbox?.click());
      expect(onOpenInbox).toHaveBeenCalledOnce();
      expect(onExit).not.toHaveBeenCalled();

      await act(async () => store.select({ kind: 'inbox' }));
      expect(inbox?.getAttribute('aria-current')).toBe('page');

      await act(async () =>
        root.render(
          createElement(entry, { size: 20, active: true, useBotModePrefs, openSettings, t }),
        ),
      );
      expect(inbox?.getAttribute('data-wide')).toBe('false');
      expect(inbox?.style.gridRow).toBe('3');
    } finally {
      await act(async () => root.unmount());
      nav.remove();
      store.select(undefined);
    }
  });
});
