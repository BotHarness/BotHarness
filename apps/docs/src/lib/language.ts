/**
 * Language-variant URL mapping for the bilingual docs site.
 *
 * Chinese is the primary site; English is mounted at `/en/**`. Every content
 * section has a counterpart in both languages (`/docs`, `/dev`, `/changelog` —
 * `/en/dev/**` and `/en/changelog/**` fall back to Chinese content), so a
 * switcher can preserve the current path. Anywhere else only the Chinese page
 * exists, so English falls back to the English docs landing.
 */

const EN_SECTIONS = ["/docs", "/dev", "/changelog"] as const;

/** Notice rendered on `/en/**` pages that fall back to the Chinese source. */
export const UNTRANSLATED_NOTICE = "本页暂未提供英文。";

export interface LanguageLinks {
  /** Whether the current route lives under `/en/**`. */
  isEn: boolean;
  /** Chinese counterpart of the current route (always exists). */
  zh: string;
  /** English counterpart, or the English docs landing when none exists. */
  en: string;
}

export function languageLinks(currentSlug: string): LanguageLinks {
  const isEn = currentSlug === "/en" || currentSlug.startsWith("/en/");
  const zh = isEn ? currentSlug.slice(3) || "/" : currentSlug;
  const hasCounterpart = EN_SECTIONS.some(
    (section) => zh === section || zh.startsWith(`${section}/`),
  );
  return {
    isEn,
    zh,
    en: isEn ? currentSlug : hasCounterpart ? `/en${zh}` : "/en/docs/overview",
  };
}
