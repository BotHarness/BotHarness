import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  return {
    Button: stub,
    IconAgentPresetOutline16: stub,
    IconChevronDownOutline14: stub,
    IconChevronRightOutline14: stub,
    IconCloseFill14: stub,
    IconEditOutline16: stub,
    IconEllipsisOutline16: stub,
    IconFolderOpenOutline16: stub,
    IconNewChatOutline16: stub,
    IconTriangleRightFill14: stub,
    IconTrashOutline16: stub,
    IconPlusOutline16: stub,
    IconSearchOutline16: stub,
    IconSendOutline16: stub,
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
import { zh, type BotHarnessKey, type BotHarnessTranslate } from '../src/client/locale.js';

const useBotModePrefs = ((selector: (value: BotModePrefsSnapshot) => unknown) =>
  selector({
    motionPreference: 'system',
    botIcon: 'mascot' as const,
    effectiveMotion: 'full',
    sortMode: 'updated',
    sortModes: {},
    mode: 'host',
    status: 'ready',
  })) as never;

const t = ((key: BotHarnessKey): string => zh[key]) as unknown as BotHarnessTranslate;
const openSettings = () => undefined;

describe('bot panel entry', () => {
  it('renders the chosen mark in both states', () => {
    const entry = createBotPanelEntry(() => undefined);
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
    expect(inactive).not.toContain('bh-panel-glyph-hit');
  });
});
