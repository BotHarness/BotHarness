import { describe, expect, it } from 'vitest';

import {
  languageLinks,
  localizeSectionLabel,
  localizeSidebar,
  localeFromPath,
  normalizeLocale,
  notFoundStrings,
  searchStrings,
  siteChrome,
  untranslatedNotice,
} from '../src/lib/language.js';

describe('languageLinks', () => {
  it('maps English section paths to their Chinese counterparts', () => {
    expect(languageLinks('/docs/x')).toEqual({
      isZh: false,
      en: '/docs/x',
      zh: '/zh/docs/x',
    });
    expect(languageLinks('/dev/x')).toEqual({
      isZh: false,
      en: '/dev/x',
      zh: '/zh/dev/x',
    });
    expect(languageLinks('/changelog')).toEqual({
      isZh: false,
      en: '/changelog',
      zh: '/zh/changelog',
    });
    expect(languageLinks('/changelog/x')).toEqual({
      isZh: false,
      en: '/changelog/x',
      zh: '/zh/changelog/x',
    });
  });

  it('strips the /zh prefix when switching back to English', () => {
    expect(languageLinks('/zh/docs/x')).toEqual({
      isZh: true,
      en: '/docs/x',
      zh: '/zh/docs/x',
    });
    expect(languageLinks('/zh/dev/x')).toEqual({
      isZh: true,
      en: '/dev/x',
      zh: '/zh/dev/x',
    });
    expect(languageLinks('/zh/changelog/x')).toEqual({
      isZh: true,
      en: '/changelog/x',
      zh: '/zh/changelog/x',
    });
  });

  it('falls back to the Chinese docs landing for paths without counterparts', () => {
    expect(languageLinks('/404')).toEqual({
      isZh: false,
      en: '/404',
      zh: '/zh/docs/overview',
    });
  });

  it('falls back to the English landing for unknown /zh paths', () => {
    expect(languageLinks('/zh/404')).toEqual({
      isZh: true,
      en: '/',
      zh: '/zh/404',
    });
  });

  it('treats the two roots as landings and maps them to each other', () => {
    expect(languageLinks('/')).toEqual({
      isZh: false,
      en: '/',
      zh: '/zh',
    });
    expect(languageLinks('/zh')).toEqual({
      isZh: true,
      en: '/',
      zh: '/zh',
    });
  });
});

describe('localeFromPath', () => {
  it('derives the locale from the route tree', () => {
    expect(localeFromPath('/docs/overview')).toBe('en');
    expect(localeFromPath('/')).toBe('en');
    expect(localeFromPath('/zh')).toBe('zh-Hans');
    expect(localeFromPath('/zh/docs/overview')).toBe('zh-Hans');
  });

  it('coerces DOM lang values to a supported locale', () => {
    expect(normalizeLocale('zh-Hans')).toBe('zh-Hans');
    expect(normalizeLocale('zh')).toBe('en');
    expect(normalizeLocale(undefined)).toBe('en');
  });
});

describe('siteChrome', () => {
  it('localizes the header nav labels per tree', () => {
    expect(siteChrome('en')).toMatchObject({
      docs: 'Docs',
      dev: 'Development & Audit',
      changelog: 'Changelog',
    });
    expect(siteChrome('zh-Hans')).toMatchObject({
      docs: '文档',
      dev: '开发与审计',
      changelog: 'Changelog',
    });
  });

  it('localizes the remaining chrome strings per tree', () => {
    expect(siteChrome('en')).toMatchObject({
      siteNavigation: 'Site navigation',
      navigation: 'Navigation',
      closeSidebar: 'Close sidebar',
      skipToContent: 'Skip to content',
      filterNavigation: 'Filter navigation',
    });
    expect(siteChrome('zh-Hans')).toMatchObject({
      siteNavigation: '站点导航',
      navigation: '导航',
      closeSidebar: '关闭侧边栏',
      skipToContent: '跳到正文',
      filterNavigation: '筛选导航',
    });
  });
});

describe('untranslatedNotice', () => {
  it('appends the counterpart link in the right language', () => {
    expect(untranslatedNotice('en', '/zh/dev/spec/platform')).toBe(
      'This page has not been translated yet. <a href="/zh/dev/spec/platform">View the Chinese version →</a>',
    );
    expect(untranslatedNotice('zh-Hans', '/dev/spec/platform')).toBe(
      '本页暂未提供中文。 <a href="/dev/spec/platform">查看英文版 →</a>',
    );
  });
});

describe('notFoundStrings', () => {
  it('localizes the 404 copy and links', () => {
    expect(notFoundStrings('en')).toEqual({
      title: 'Page not found',
      heading: 'Page not found',
      description: "The page you're looking for doesn't exist or has moved.",
      counterpart: 'View the Chinese version →',
      home: 'Back home',
      docs: 'Browse the docs',
    });
    expect(notFoundStrings('zh-Hans')).toEqual({
      title: '页面未找到',
      heading: '页面未找到',
      description: '你访问的页面不存在或已被移动。',
      counterpart: '查看英文版 →',
      home: '返回首页',
      docs: '浏览文档',
    });
  });
});

describe('localizeSidebar', () => {
  const tree = [
    {
      type: 'group',
      label: 'Docs',
      children: [{ type: 'link', label: 'Overview', href: '/docs/overview' }],
    },
    {
      type: 'group',
      label: 'Dev',
      children: [{ type: 'link', label: 'Architecture', href: '/dev/architecture' }],
    },
    {
      type: 'group',
      label: 'Changelog',
      children: [{ type: 'link', label: 'v1', href: '/changelog/v1' }],
    },
    { type: 'link', label: 'Overview', href: '/docs/overview' },
  ];

  it('renames top-level section groups by href prefix', () => {
    const localized = localizeSidebar(tree, 'zh-Hans');
    expect(localized.map((item) => item.label)).toEqual(['文档', '开发与审计', 'Changelog', 'Overview']);
    expect(localized[0].children).toBe(tree[0].children);
  });

  it('maps the English tree to the chrome labels too', () => {
    expect(localizeSidebar(tree, 'en').map((item) => item.label)).toEqual([
      'Docs',
      'Development & Audit',
      'Changelog',
      'Overview',
    ]);
  });

  it('matches /zh-prefixed hrefs', () => {
    const zhTree = [
      {
        type: 'group',
        label: 'Dev',
        children: [{ type: 'link', label: 'Architecture', href: '/zh/dev/architecture' }],
      },
    ];
    expect(localizeSidebar(zhTree, 'zh-Hans')[0].label).toBe('开发与审计');
  });

  it('leaves nested folder groups inside a section alone', () => {
    const scoped = [
      {
        type: 'group',
        label: 'Adr',
        children: [{ type: 'link', label: 'ADR 1', href: '/zh/dev/adr/0001' }],
      },
    ];
    expect(localizeSidebar(scoped, 'zh-Hans')[0].label).toBe('Adr');
    expect(localizeSidebar(scoped, 'en')[0].label).toBe('Adr');
  });
});

describe('localizeSectionLabel', () => {
  it('maps folder-derived group labels per locale', () => {
    expect(localizeSectionLabel('Docs', 'zh-Hans')).toBe('文档');
    expect(localizeSectionLabel('Dev', 'zh-Hans')).toBe('开发与审计');
    expect(localizeSectionLabel('Docs', 'en')).toBe('Docs');
    expect(localizeSectionLabel('Dev', 'en')).toBe('Development & Audit');
  });

  it('leaves page titles alone', () => {
    expect(localizeSectionLabel('Overview', 'zh-Hans')).toBe('Overview');
  });
});

describe('searchStrings', () => {
  it('localizes the search placeholder and result states', () => {
    expect(searchStrings('en').placeholder).toBe('Search documentation…');
    expect(searchStrings('en').noResults).toBe('No results found.');
    expect(searchStrings('zh-Hans').placeholder).toBe('搜索文档…');
    expect(searchStrings('zh-Hans').noResults).toBe('未找到结果。');
  });
});
