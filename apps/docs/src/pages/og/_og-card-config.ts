/**
 * Shared visual config for build-time OG cards.
 *
 * Edit this file to retune generated card colors, spacing, and fonts. Both
 * the per-page endpoint (`og/[...slug].ts`) and the homepage fallback
 * (`og.png.ts`) spread this object into `astro-og-canvas`.
 *
 * Chinese titles/descriptions need a CJK face: Inter has no Han glyphs, so
 * cards rendered with it alone show tofu boxes. CanvasKit cannot decode the
 * WOFF2 CJK files `@fontsource` ships, so the site commits a Noto Sans SC
 * **subset** (OTF) covering exactly the frontmatter of the card sources.
 * Regenerate it with `pnpm og:font` after editing Chinese page copy; see
 * `scripts/subset-og-font.mjs`.
 *
 * Leading underscore tells Astro to skip routing for this file — it sits
 * inside `src/pages/` to be next to its consumers, but it's not a route.
 */

import type { OGImageOptions } from "astro-og-canvas";

const INTER = "./public/fonts/Inter-Bold.ttf";
const NOTO_SANS_SC = "./public/fonts/NotoSansSC-Bold.og-subset.otf";
const HAN = /\p{Script=Han}/u;

export const ogCardConfig = {
  bgGradient: [
    [11, 11, 12],
    [26, 26, 28],
  ],
  border: { color: [39, 39, 42], width: 2, side: "inline-start" },
  padding: 96,
  fonts: [INTER],
  font: {
    title: {
      color: [250, 250, 250],
      size: 64,
      weight: "Bold",
      families: ["Inter"],
      lineHeight: 1.1,
    },
    description: {
      color: [161, 161, 170],
      size: 32,
      weight: "Bold",
      families: ["Inter"],
      lineHeight: 1.3,
    },
  },
  format: "PNG",
} satisfies Partial<OGImageOptions>;

/**
 * Same card with Noto Sans SC appended to the fallback chain, so Han
 * characters render while Latin text keeps using Inter (and therefore looks
 * identical to the English cards).
 */
export const ogCardConfigCjk = {
  ...ogCardConfig,
  fonts: [...ogCardConfig.fonts, NOTO_SANS_SC],
  font: {
    title: {
      ...ogCardConfig.font.title,
      families: [...ogCardConfig.font.title.families, "Noto Sans SC"],
    },
    description: {
      ...ogCardConfig.font.description,
      families: [...ogCardConfig.font.description.families, "Noto Sans SC"],
    },
  },
} satisfies Partial<OGImageOptions>;

/**
 * Pick the config whose fonts cover the text that will actually be drawn.
 * Chinese changelog entries live at English paths, so the choice is made on
 * the copy, not on the route.
 */
export function ogCardConfigFor(page: {
  title: string;
  description?: string;
}): Partial<OGImageOptions> {
  return HAN.test(`${page.title}${page.description ?? ""}`)
    ? ogCardConfigCjk
    : ogCardConfig;
}
