
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

export function ogCardConfigFor(page: {
  title: string;
  description?: string;
}): Partial<OGImageOptions> {
  return HAN.test(`${page.title}${page.description ?? ""}`)
    ? ogCardConfigCjk
    : ogCardConfig;
}
