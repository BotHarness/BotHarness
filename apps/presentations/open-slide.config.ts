import type { OpenSlideConfig } from '@open-slide/core';

declare const process: { env: Record<string, string | undefined> } | undefined;

// Local dev serves at `/`. The docs site embeds the built deck at `/slides/`,
// so build with `OPEN_SLIDE_BASE=/slides/` for docs (see `scripts/sync-slides.mjs`).
const openSlideConfig: OpenSlideConfig = {
  base: process?.env.OPEN_SLIDE_BASE ?? '/',
};

export default openSlideConfig;
