import { DEVELOPMENT_STATUS_ROUTE } from "./development-status-route";


const ZH_SECTIONS = [
  "/docs",
  "/dsh",
  "/dev",
  DEVELOPMENT_STATUS_ROUTE.html.en,
  "/changelog",
] as const;

export type Locale = "en" | "zh-Hans";

function isZhPath(path: string): boolean {
  return path === "/zh" || path.startsWith("/zh/");
}

export function localeFromPath(path: string): Locale {
  return isZhPath(path) ? "zh-Hans" : "en";
}

export function normalizeLocale(value: string | null | undefined): Locale {
  return value === "zh-Hans" ? "zh-Hans" : "en";
}

export const UNTRANSLATED_NOTICE_EN = "This page has not been translated yet.";

export const UNTRANSLATED_NOTICE_ZH = "本页暂未提供中文。";

export function untranslatedNotice(locale: Locale, href: string): string {
  return locale === "zh-Hans"
    ? `${UNTRANSLATED_NOTICE_ZH} <a href="${href}">查看英文版 →</a>`
    : `${UNTRANSLATED_NOTICE_EN} <a href="${href}">View the Chinese version →</a>`;
}

function hasCounterpart(path: string): boolean {
  return (
    path === "/" ||
    ZH_SECTIONS.some((section) => path === section || path.startsWith(`${section}/`))
  );
}

export interface LanguageLinks {
  isZh: boolean;
  en: string;
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

export interface LocaleAlternate {
  hreflang: "en" | "zh-Hans" | "x-default";
  path: string;
}

function canonicalPath(path: string): string {
  return path === "/" || path.endsWith("/") ? path : `${path}/`;
}

export function localeAlternates(currentSlug: string): LocaleAlternate[] {
  const { en, zh } = languageLinks(currentSlug);
  return [
    { hreflang: "en", path: canonicalPath(en) },
    { hreflang: "zh-Hans", path: canonicalPath(zh) },
    { hreflang: "x-default", path: canonicalPath(en) },
  ];
}

export interface SiteChromeStrings {
  sections: string;
  language: string;
  docs: string;
  dsh: string;
  dev: string;
  status: string;
  changelog: string;
  openNavigation: string;
  toggleTheme: string;
  siteNavigation: string;
  navigation: string;
  closeSidebar: string;
  filterPlaceholder: string;
  filterNavigation: string;
  skipToContent: string;
  draft: string;
  provenance: string;
  forHumans: string;
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

export interface NotFoundStrings {
  title: string;
  heading: string;
  description: string;
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

export interface SidebarNode {
  label: string;
  type?: string;
  href?: string;
  indexHref?: string;
  children?: SidebarNode[];
}

const SECTION_LABEL_KEYS: Record<string, "docs" | "dev"> = {
  Docs: "docs",
  Dev: "dev",
};

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

export function localizeSidebar<T extends SidebarNode>(tree: T[], locale: Locale): T[] {
  const chrome = siteChrome(locale);
  return tree.map((node) => {
    if (node.type !== "group") return node;
    const section = SECTION_LABEL_KEYS[node.label];
    if (!section || sectionOf(node) !== section) return node;
    return { ...node, label: chrome[section] };
  });
}

export interface SearchStrings {
  label: string;
  trigger: string;
  placeholder: string;
  initial: string;
  searching: string;
  noResults: string;
  unavailable: string;
  productionBuild: string;
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
