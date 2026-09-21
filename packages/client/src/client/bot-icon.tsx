import { blobatar } from 'blobatar';
import type { CSSProperties, ReactElement } from 'react';

import type { BotModeIcon } from '../bot-mode-settings.js';
import { DEEPSEEKBOT_DARK_DATA_URI, DEEPSEEKBOT_LIGHT_DATA_URI } from './bot-icon-assets.js';
import { useBotColorScheme, type BotColorScheme } from './bot-color-scheme.js';

/**
 * Deterministic seed for the generated Bot blob, so the mark is one stable
 * identity rather than a new face on every render.
 */
export const BOT_BLOB_SEED = 'botharness:bot';

/**
 * The generic bot glyph (Lucide `bot`, ISC) as inline SVG. DSH's icon set has
 * no bot mark, so the shape is vendored; `currentColor` lets it follow the
 * surrounding text color in either palette.
 */
export const BOT_GLYPH_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/>' +
  '<path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>';

/**
 * Markup for one Bot mark. The mascot ships as palette-matched PNG data URIs;
 * the blob is generated deterministically; the glyph is inline SVG. Everything
 * returns markup so the same resolver feeds React and the Settings navigation
 * patch, and the caller only needs CSS to size it.
 * @param icon - Chosen mark.
 * @param scheme - Active palette, used by artwork with a dark variant.
 * @returns HTML markup for one icon box.
 */
export function botIconMarkup(icon: BotModeIcon, scheme: BotColorScheme): string {
  if (icon === 'mascot') {
    const source = scheme === 'dark' ? DEEPSEEKBOT_DARK_DATA_URI : DEEPSEEKBOT_LIGHT_DATA_URI;
    return `<img src="${source}" alt="" draggable="false" />`;
  }
  if (icon === 'blob') {
    try {
      return blobatar(BOT_BLOB_SEED);
    } catch {
      return BOT_GLYPH_SVG;
    }
  }
  return BOT_GLYPH_SVG;
}

/** The Bot mark as a React element sized by the caller's box. */
export function BotIcon({
  icon,
  size,
  className,
}: {
  readonly icon: BotModeIcon;
  readonly size: number;
  readonly className?: string | undefined;
}): ReactElement {
  const scheme = useBotColorScheme();
  return (
    <span
      className={className === undefined ? 'bh-bot-icon' : `bh-bot-icon ${className}`}
      style={{ '--bh-bot-icon-size': `${String(size)}px` } as CSSProperties}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: botIconMarkup(icon, scheme) }}
    />
  );
}
