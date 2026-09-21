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

describe('bot panel entry', () => {
  it('arms the row-wide exit target only while the panel is active', () => {
    const entry = createBotPanelEntry(() => undefined);
    const inactive = renderToStaticMarkup(
      createElement(entry, { size: 16, active: false, useBotModePrefs }),
    );
    const active = renderToStaticMarkup(
      createElement(entry, { size: 16, active: true, useBotModePrefs }),
    );

    expect(inactive).not.toContain('bh-panel-glyph-hit');
    expect(active).toContain('bh-panel-glyph-hit');
  });
});
