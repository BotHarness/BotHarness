import { describe, expect, it } from 'vitest';

import { languageLinks } from '../src/lib/language.js';

describe('languageLinks', () => {
  it('maps Chinese section paths to their English counterparts', () => {
    expect(languageLinks('/docs/x')).toEqual({
      isEn: false,
      zh: '/docs/x',
      en: '/en/docs/x',
    });
    expect(languageLinks('/dev/x')).toEqual({
      isEn: false,
      zh: '/dev/x',
      en: '/en/dev/x',
    });
    expect(languageLinks('/changelog')).toEqual({
      isEn: false,
      zh: '/changelog',
      en: '/en/changelog',
    });
    expect(languageLinks('/changelog/x')).toEqual({
      isEn: false,
      zh: '/changelog/x',
      en: '/en/changelog/x',
    });
  });

  it('strips the /en prefix when switching back to Chinese', () => {
    expect(languageLinks('/en/docs/x')).toEqual({
      isEn: true,
      zh: '/docs/x',
      en: '/en/docs/x',
    });
    expect(languageLinks('/en/dev/x')).toEqual({
      isEn: true,
      zh: '/dev/x',
      en: '/en/dev/x',
    });
    expect(languageLinks('/en/changelog/x')).toEqual({
      isEn: true,
      zh: '/changelog/x',
      en: '/en/changelog/x',
    });
  });

  it('falls back to the English docs landing for paths without counterparts', () => {
    expect(languageLinks('/')).toEqual({
      isEn: false,
      zh: '/',
      en: '/en/docs/overview',
    });
    expect(languageLinks('/404')).toEqual({
      isEn: false,
      zh: '/404',
      en: '/en/docs/overview',
    });
  });

  it('treats the /en root as English and maps it back to /', () => {
    expect(languageLinks('/en')).toEqual({
      isEn: true,
      zh: '/',
      en: '/en',
    });
  });
});
