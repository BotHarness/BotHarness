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
    IconEllipsisOutline16: stub,
    IconFolderOpenOutline16: stub,
    IconNewChatOutline16: stub,
    IconTriangleRightFill14: stub,
    IconPlusOutline16: stub,
    IconSearchOutline16: stub,
    IconSendOutline16: stub,
    Input: stub,
    Menu: stub,
    StateDot: stub,
    Tag: stub,
    Tooltip: stub,
    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

import { createBotPanelEntry } from '../src/client/bot-sidebar.js';

describe('bot panel entry', () => {
  it('arms the row-wide exit target only while the panel is active', () => {
    const entry = createBotPanelEntry(() => undefined);
    const inactive = renderToStaticMarkup(createElement(entry, { size: 16, active: false }));
    const active = renderToStaticMarkup(createElement(entry, { size: 16, active: true }));

    expect(inactive).not.toContain('bh-panel-glyph-hit');
    expect(active).toContain('bh-panel-glyph-hit');
  });
});
