import { describe, expect, it } from 'vitest';

import { desktopLocale, isSafeArchiveName } from '../src/index.js';

describe('desktop locale mapping', () => {
  it('maps shipped languages onto generated locales', () => {
    expect(desktopLocale('zh-CN')).toBe('zh_CN.UTF-8');
    expect(desktopLocale('zh')).toBe('zh_CN.UTF-8');
    expect(desktopLocale('en-US')).toBe('en_US.UTF-8');
    expect(desktopLocale('de')).toBe('en_US.UTF-8');
  });
});

describe('archive name validation', () => {
  it('accepts provider-generated archive names', () => {
    expect(isSafeArchiveName('botharness-computer-config-2026-09-21T12-00-00-000Z.tar')).toBe(true);
  });

  it('rejects traversal and unrelated names', () => {
    expect(isSafeArchiveName('../secret.tar')).toBe(false);
    expect(isSafeArchiveName('..tar')).toBe(false);
    expect(isSafeArchiveName('/etc/passwd')).toBe(false);
    expect(isSafeArchiveName('notes.txt')).toBe(false);
    expect(isSafeArchiveName('')).toBe(false);
  });
});
