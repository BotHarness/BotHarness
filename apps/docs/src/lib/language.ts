import { DEVELOPMENT_STATUS_ROUTE } from "./development-status-route";

/**
 * Language-variant URL mapping for the bilingual docs site.
 *
 * English is the primary site (served at the root); Chinese is mounted at
 * `/zh/**`. Every content section has a counterpart in both languages
 * (`/docs`, `/dev`, `/changelog` — mirrored under `/zh/...`), so a switcher
 * can preserve the current path. Anywhere else only the English page exists,
 * so Chinese falls back to the Chinese docs landing, and unknown `/zh/**`
 * paths fall back to the English landing.
 */

const ZH_SECTIONS = [
  "/docs",
  "/dsh",
  "/dev",
  DEVELOPMENT_STATUS_ROUTE.html.en,
  "/changelog",
] as const;

/** Site locales, matching `<html lang>`: English root + Simplified Chinese. */
export type Locale = "en" | "zh-Hans";

/** Whether a path lives under the `/zh` language variant. */
function isZhPath(path: string): boolean {
  return path === "/zh" || path.startsWith("/zh/");
}

/** Site locale for a route path (Chinese for `/zh/**`, English otherwise). */
export function localeFromPath(path: string): Locale {
  return isZhPath(path) ? "zh-Hans" : "en";
}

/** Coerce a DOM value (e.g. `<html lang>`) to a supported site locale. */
export function normalizeLocale(value: string | null | undefined): Locale {
  return value === "zh-Hans" ? "zh-Hans" : "en";
}

/** Notice on English-tree pages that fall back to the Chinese source. */
export const UNTRANSLATED_NOTICE_EN = "This page has not been translated yet.";

/** Notice on `/zh/**` pages that fall back to the English source (rare). */
export const UNTRANSLATED_NOTICE_ZH = "本页暂未提供中文。";

/**
 * Banner body for a page whose `untranslated` content falls back to the other
 * language: the notice plus a link to the counterpart page. `href` must
 * already include the base; the banner sanitizer allows plain `<a href>`.
 */
export function untranslatedNotice(locale: Locale, href: string): string {
  return locale === "zh-Hans"
    ? `${UNTRANSLATED_NOTICE_ZH} <a href="${href}">查看英文版 →</a>`
    : `${UNTRANSLATED_NOTICE_EN} <a href="${href}">View the Chinese version →</a>`;
}

/** Whether a path is the landing or one of the mirrored sections. */
function hasCounterpart(path: string): boolean {
  return (
    path === "/" ||
    ZH_SECTIONS.some((section) => path === section || path.startsWith(`${section}/`))
  );
}

export interface LanguageLinks {
  /** Whether the current route lives under `/zh/**`. */
  isZh: boolean;
  /** English counterpart of the current route. */
  en: string;
  /** Chinese counterpart, or the Chinese docs landing when none exists. */
  zh: string;
}

export function languageLinks(currentSlug: string): LanguageLinks {
  const isZh = isZhPath(currentSlug);
  if (isZh) {
    const en = currentSlug.slice(3) || "/";
    return { isZh, zh: currentSlug, en: hasCounterpart(en) ? en : "/" };
  }
  const zh = hasCounterpart(currentSlug) ? `/zh${currentSlug === "/" ? "" : currentSlug}` : "/zh/docs/overview";
  return { isZh, zh, en: currentSlug };
}

/** One `<link rel="alternate" hreflang>`: language tag plus counterpart path. */
export interface LocaleAlternate {
  hreflang: "en" | "zh-Hans" | "x-default";
  /** Site-root-relative counterpart path, without the base. */
  path: string;
}

/**
 * Normalize to the canonical form Astro emits for directory routes (the
 * counterpart of `Astro.url.pathname` / the built canonical URL), so an
 * alternate never points at a redirecting URL. `/` stays bare.
 */
function canonicalPath(path: string): string {
  return path === "/" || path.endsWith("/") ? path : `${path}/`;
}

/**
 * hreflang alternates for a route: the English and Chinese counterparts plus
 * `x-default` — the English page, since the root tree is primary. Counterpart
 * resolution matches `languageLinks`, so pages without a true translation
 * point at the same fallbacks as the language switcher.
 */
export function localeAlternates(currentSlug: string): LocaleAlternate[] {
  const { en, zh } = languageLinks(currentSlug);
  return [
    { hreflang: "en", path: canonicalPath(en) },
    { hreflang: "zh-Hans", path: canonicalPath(zh) },
    { hreflang: "x-default", path: canonicalPath(en) },
  ];
}

/** Prose the site header renders; labels are endonyms where they have one. */
export interface SiteChromeStrings {
  /** `aria-label` on the section nav. */
  sections: string;
  /** `aria-label` on the language switcher. */
  language: string;
  docs: string;
  dsh: string;
  dev: string;
  status: string;
  changelog: string;
  /** `aria-label` on the mobile menu button. */
  openNavigation: string;
  /** `aria-label` on the theme toggle. */
  toggleTheme: string;
  /** `aria-label` on the mobile sidebar dialog. */
  siteNavigation: string;
  /** Heading of the mobile sidebar panel. */
  navigation: string;
  /** `aria-label` on the mobile sidebar close button. */
  closeSidebar: string;
  /** Placeholder of the sidebar filter input. */
  filterPlaceholder: string;
  /** `aria-label` on the sidebar filter input. */
  filterNavigation: string;
  /** Skip link that jumps past the header. */
  skipToContent: string;
  /** Badge on a page still in draft. */
  draft: string;
  /** Label of the DSH Dev Docs provenance bar (skill version / DSH revision). */
  provenance: string;
  /** Badge splitting agent- and human-facing content. */
  forHumans: string;
  /** Link to the page source. */
  editPage: string;
}

export function siteChrome(locale: Locale): SiteChromeStrings {
  if (locale === "zh-Hans") {
    return {
      sections: "站点分区",
      language: "语言",
      docs: "文档",
      dsh: "DSH 开发",
      dev: "开发与审计",
      status: "开发状态",
      changelog: "Changelog",
      openNavigation: "打开导航",
      toggleTheme: "切换深色模式",
      siteNavigation: "站点导航",
      navigation: "导航",
      closeSidebar: "关闭侧边栏",
      filterPlaceholder: "筛选…",
      filterNavigation: "筛选导航",
      skipToContent: "跳到正文",
      draft: "草稿",
      provenance: "出处",
      forHumans: "面向人类",
      editPage: "编辑此页",
    };
  }
  return {
    sections: "Sections",
    language: "Language",
    docs: "Docs",
    dsh: "DSH Dev",
    dev: "Development & Audit",
    status: "Status",
    changelog: "Changelog",
    openNavigation: "Open navigation",
    toggleTheme: "Toggle dark mode",
    siteNavigation: "Site navigation",
    navigation: "Navigation",
    closeSidebar: "Close sidebar",
    filterPlaceholder: "Filter…",
    filterNavigation: "Filter navigation",
    skipToContent: "Skip to content",
    draft: "Draft",
    provenance: "Provenance",
    forHumans: "For humans",
    editPage: "Edit this page",
  };
}

/** Localized copy for the 404 page. */
export interface NotFoundStrings {
  /** Document title, without the site suffix. */
  title: string;
  heading: string;
  description: string;
  /** Link to the counterpart of the attempted path in the other language. */
  counterpart: string;
  home: string;
  docs: string;
}

export function notFoundStrings(locale: Locale): NotFoundStrings {
  if (locale === "zh-Hans") {
    return {
      title: "页面未找到",
      heading: "页面未找到",
      description: "你访问的页面不存在或已被移动。",
      counterpart: "查看英文版 →",
      home: "返回首页",
      docs: "浏览文档",
    };
  }
  return {
    title: "Page not found",
    heading: "Page not found",
    description: "The page you're looking for doesn't exist or has moved.",
    counterpart: "View the Chinese version →",
    home: "Back home",
    docs: "Browse the docs",
  };
}

/** Minimal structural view of a navigation tree item (Nimbus `SidebarItem`). */
export interface SidebarNode {
  label: string;
  type?: string;
  href?: string;
  indexHref?: string;
  children?: SidebarNode[];
}

/** Folder-derived top-level labels the sidebar/breadcrumb derives. */
const SECTION_LABEL_KEYS: Record<string, "docs" | "dev"> = {
  Docs: "docs",
  Dev: "dev",
};

/** Localize a folder-derived section label (`Docs` / `Dev`). */
export function localizeSectionLabel(label: string, locale: Locale): string {
  const key = SECTION_LABEL_KEYS[label];
  return key ? siteChrome(locale)[key] : label;
}

function pathInSection(href: string, section: string): boolean {
  const path = isZhPath(href) ? href.slice(3) || "/" : href;
  return path === section || path.startsWith(`${section}/`);
}

function sectionOf(node: SidebarNode): "docs" | "dev" | undefined {
  const stack: SidebarNode[] = [node];
  while (stack.length > 0) {
    const item = stack.shift()!;
    for (const href of [item.href, item.indexHref]) {
      if (!href) continue;
      if (pathInSection(href, "/docs")) return "docs";
      if (pathInSection(href, "/dev")) return "dev";
    }
    stack.push(...(item.children ?? []));
  }
  return undefined;
}

/**
 * Localize the labels of top-level section groups in a sidebar tree: a group
 * counts only when its label is the folder-derived section name (`Docs` /
 * `Dev`) *and* its hrefs live under that section (`/docs` vs `/dev`, `/zh`
 * prefixed on the Chinese tree). Nested folder groups (`Adr`, `Spec`) and
 * non-group items are left untouched — page titles are content, not chrome.
 * `/changelog` has no group label.
 */
export function localizeSidebar<T extends SidebarNode>(tree: T[], locale: Locale): T[] {
  const chrome = siteChrome(locale);
  return tree.map((node) => {
    if (node.type !== "group") return node;
    const section = SECTION_LABEL_KEYS[node.label];
    if (!section || sectionOf(node) !== section) return node;
    return { ...node, label: chrome[section] };
  });
}

/** User-visible strings for the search UI (server-rendered + client runtime). */
export interface SearchStrings {
  /** `aria-label` on the trigger and dialog. */
  label: string;
  /** Visible trigger label. */
  trigger: string;
  placeholder: string;
  /** Initial empty state, and the state after a reset. */
  initial: string;
  searching: string;
  noResults: string;
  unavailable: string;
  productionBuild: string;
  /** Fallback title when a Pagefind result has none. */
  untitled: string;
  navigateHint: string;
  selectHint: string;
  closeHint: string;
}

export function searchStrings(locale: Locale): SearchStrings {
  if (locale === "zh-Hans") {
    return {
      label: "搜索文档",
      trigger: "搜索",
      placeholder: "搜索文档…",
      initial: "输入以搜索…",
      searching: "搜索中…",
      noResults: "未找到结果。",
      unavailable: "搜索暂时不可用。",
      productionBuild: "搜索需在生产构建后可用。",
      untitled: "无标题",
      navigateHint: "↑↓ 导航",
      selectHint: "↵ 选择",
      closeHint: "Esc 关闭",
    };
  }
  return {
    label: "Search documentation",
    trigger: "Search",
    placeholder: "Search documentation…",
    initial: "Type to search…",
    searching: "Searching…",
    noResults: "No results found.",
    unavailable: "Search is temporarily unavailable.",
    productionBuild: "Search is available after a production build.",
    untitled: "Untitled",
    navigateHint: "↑↓ navigate",
    selectHint: "↵ select",
    closeHint: "Esc close",
  };
}
