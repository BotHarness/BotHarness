import { describe, expect, it } from 'vitest';

import { BOT_GLYPH_SVG, botIconMarkup } from '../src/client/bot-icon.js';
import { isBotNavLabel } from '../src/client/bot-icon-nav.js';

describe('bot icon markup', () => {
  it('serves the mascot as palette-matched artwork', () => {
    const light = botIconMarkup('mascot', 'light');
    const dark = botIconMarkup('mascot', 'dark');
    expect(light).toContain('<img');
    expect(light).toContain('data:image/png;base64,');
    expect(dark).toContain('data:image/png;base64,');
    expect(dark).not.toBe(light);
  });

  it('generates one deterministic blob', () => {
    const first = botIconMarkup('blob', 'light');
    expect(first).toContain('<svg');
    expect(botIconMarkup('blob', 'dark')).toBe(first);
  });

  it('falls back to the vendored glyph for the generic bot mark', () => {
    expect(botIconMarkup('bot', 'light')).toBe(BOT_GLYPH_SVG);
    expect(BOT_GLYPH_SVG).toContain('stroke="currentColor"');
  });
});

describe('bot nav label matching', () => {
  it('matches the localized section label and ignores everything else', () => {
    const labels = ['Bot 设置', 'Bot settings'];
    expect(isBotNavLabel('Bot 设置', labels)).toBe(true);
    expect(isBotNavLabel('  Bot settings  ', labels)).toBe(true);
    expect(isBotNavLabel('通用设置', labels)).toBe(false);
    expect(isBotNavLabel('', labels)).toBe(false);
    expect(isBotNavLabel(null, labels)).toBe(false);
    expect(isBotNavLabel(undefined, labels)).toBe(false);
  });
});
