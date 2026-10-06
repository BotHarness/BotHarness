import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import {
  absolutizeLedgerLinks,
  pairReleaseLedgers,
  parseReleaseNotes,
  selectReleaseNotes,
} from '../src/release/notes.js';
import { createReleaseService, installedRelease } from '../src/release/service.js';
import { compareVersions, isReleaseVersion } from '../src/release/version.js';

const english = `# DeepSeekBot Changelog

## [Unreleased]

Nothing yet.

## [1.1.0] - 2026-10-20

Bot mode shows what changed.

### Added

- Added the changelog dialog ([#1](https://github.com/BotHarness/BotHarness/issues/1), [guide](docs/guide.md)).

### Fixed

- Fixed one thing ([#2](https://github.com/BotHarness/BotHarness/issues/2)).

## [1.0.1] - 2026-10-05

First stable release.

### Added

- Added PersonaBots ([#3](https://github.com/BotHarness/BotHarness/issues/3)).

## [Development] - 2026-09-20

Development history.

### Added

- Old work ([#4](https://github.com/BotHarness/BotHarness/issues/4)).
`;

const chinese = `# DeepSeekBot 更新日志

## [Unreleased]

暂无。

## [1.1.0] - 2026-10-20

Bot 模式会显示更新内容。

### Added

- 增加更新日志弹窗（[#1](https://github.com/BotHarness/BotHarness/issues/1)，[指南](docs/guide.md)）。

### Fixed

- 修复一处问题（[#2](https://github.com/BotHarness/BotHarness/issues/2)）。

## [1.0.1] - 2026-10-05

首个正式版本。

### Added

- 增加 PersonaBot（[#3](https://github.com/BotHarness/BotHarness/issues/3)）。
`;

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200 });
}

describe('release versions', () => {
  it('orders releases and prereleases by SemVer precedence', () => {
    expect(compareVersions('1.0.1', '1.0.0')).toBe(1);
    expect(compareVersions('1.0.0-rc.2', '1.0.0-rc.10')).toBe(-1);
    expect(compareVersions('1.0.0-rc.1', '1.0.0')).toBe(-1);
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1);
    expect(compareVersions('2.0.0', '2.0.0')).toBe(0);
    expect(isReleaseVersion('1.0.1')).toBe(true);
    expect(isReleaseVersion('0.0.0')).toBe(false);
    expect(isReleaseVersion('Unreleased')).toBe(false);
  });
});

describe('release notes', () => {
  it('pairs both ledgers by version and skips Unreleased and Development', () => {
    const notes = pairReleaseLedgers(english, chinese);
    expect(notes.map((note) => note.version)).toEqual(['1.1.0', '1.0.1']);
    expect(notes[0]?.summary).toEqual({
      en: 'Bot mode shows what changed.',
      zh: 'Bot 模式会显示更新内容。',
    });
    expect(notes[0]?.sections.map((section) => section.name)).toEqual(['Added', 'Fixed']);
    expect(notes[0]?.sections[0]?.entries[0]?.zh).toContain('增加更新日志弹窗');
    expect(notes[0]?.sections[0]?.entries[0]?.en).toContain(
      '(https://github.com/BotHarness/BotHarness/blob/main/docs/guide.md)',
    );
  });

  it('falls back to English when the Chinese ledger lacks a release', () => {
    const notes = pairReleaseLedgers(english, '# 更新日志\n');
    expect(notes[1]?.summary.zh).toBe('First stable release.');
    expect(notes[1]?.sections[0]?.entries[0]?.zh).toContain('Added PersonaBots');
  });

  it('keeps absolute and anchor links unchanged', () => {
    expect(absolutizeLedgerLinks('[a](https://x.test/a) [b](#b) [c](./docs/c.md)')).toBe(
      '[a](https://x.test/a) [b](#b) [c](https://github.com/BotHarness/BotHarness/blob/main/docs/c.md)',
    );
  });

  it('selects the releases after the last seen version up to the installed one', () => {
    const notes = pairReleaseLedgers(english, chinese);
    expect(
      selectReleaseNotes(notes, { after: '1.0.1', through: '1.1.0' }).map((n) => n.version),
    ).toEqual(['1.1.0']);
    expect(
      selectReleaseNotes(notes, { after: '1.0.0', through: '1.0.1' }).map((n) => n.version),
    ).toEqual(['1.0.1']);
    expect(selectReleaseNotes(notes, { after: '1.1.0', through: '1.1.0' })).toEqual([]);
  });

  it('round-trips the bridge payload and rejects malformed notes', () => {
    const notes = pairReleaseLedgers(english, chinese);
    expect(parseReleaseNotes(JSON.parse(JSON.stringify(notes)))).toEqual(notes);
    expect(parseReleaseNotes([{ version: '1.0.0' }])).toBeUndefined();
    expect(parseReleaseNotes({})).toBeUndefined();
  });

  it('parses the repository ledgers into at least the current release', () => {
    const notes = pairReleaseLedgers(
      readFileSync(new URL('../../../CHANGELOG.md', import.meta.url), 'utf8'),
      readFileSync(new URL('../../../CHANGELOG.zh.md', import.meta.url), 'utf8'),
    );
    expect(notes.some((note) => note.version === '1.0.1')).toBe(true);
    for (const note of notes) {
      expect(note.summary.zh.length).toBeGreaterThan(0);
      expect(note.sections.length).toBeGreaterThan(0);
    }
  });
});

describe('release service', () => {
  const ledgers = () => ({ english, chinese });

  it('returns only the installed release on first open and the gap afterwards', () => {
    const service = createReleaseService({ version: () => '1.1.0', ledgers });
    expect(service.info().releases.map((note) => note.version)).toEqual(['1.1.0']);
    expect(service.info('1.0.0').releases.map((note) => note.version)).toEqual(['1.1.0', '1.0.1']);
    expect(service.info('1.1.0').releases).toEqual([]);
  });

  it('treats a source build as a development version without notes or checks', async () => {
    const fetchImpl = vi.fn();
    const service = createReleaseService({ version: () => '0.0.0', ledgers, fetchImpl });
    expect(service.info()).toEqual({ version: '0.0.0', releases: [] });
    expect(await service.update()).toEqual({ status: 'development', current: '0.0.0' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports a newer npm release with its notes from the published package', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === 'https://registry.test/-/package/deepseekbot/dist-tags')
        return jsonResponse({ latest: '1.1.0', next: '1.1.0' });
      if (url === 'https://notes.test/1.1.0/CHANGELOG.md') return new Response(english);
      if (url === 'https://notes.test/1.1.0/CHANGELOG.zh.md') return new Response(chinese);
      return new Response('', { status: 404 });
    });
    const service = createReleaseService({
      version: () => '1.0.1',
      ledgers,
      fetchImpl: fetchImpl as typeof fetch,
      registries: ['https://registry.test'],
      noteSources: [(version) => `https://notes.test/${version}/`],
    });
    const update = await service.update();
    expect(update).toMatchObject({ status: 'available', current: '1.0.1', latest: '1.1.0' });
    expect(update.status === 'available' && update.releases.map((note) => note.version)).toEqual([
      '1.1.0',
    ]);
    await service.update();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('falls through registries and reports up to date or unavailable', async () => {
    const reachable = vi.fn(async (input: string | URL | Request) =>
      String(input).startsWith('https://down.test')
        ? Promise.reject(new Error('offline'))
        : jsonResponse({ latest: '1.0.1' }),
    );
    const current = createReleaseService({
      version: () => '1.0.1',
      ledgers,
      fetchImpl: reachable as typeof fetch,
      registries: ['https://down.test', 'https://mirror.test'],
    });
    expect(await current.update()).toEqual({
      status: 'current',
      current: '1.0.1',
      latest: '1.0.1',
    });

    let clock = 0;
    const offline = vi.fn(async () => Promise.reject(new Error('offline')));
    const unavailable = createReleaseService({
      version: () => '1.0.1',
      ledgers,
      fetchImpl: offline as typeof fetch,
      registries: ['https://down.test'],
      now: () => clock,
    });
    expect(await unavailable.update()).toEqual({ status: 'unavailable', current: '1.0.1' });
    clock = 6 * 60 * 1000;
    await unavailable.update();
    expect(offline).toHaveBeenCalledTimes(2);
  });

  it('reads the installed version and ledgers next to the module', () => {
    const release = installedRelease(new URL('../src/plugin.ts', import.meta.url).href);
    expect(release.version()).toBe('0.0.0');
    expect(release.ledgers()?.english).toContain('# DeepSeekBot Changelog');
    expect(release.ledgers()?.chinese).toContain('# DeepSeekBot 更新日志');
  });
});
