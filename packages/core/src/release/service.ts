import { readFileSync } from 'node:fs';

import { pairReleaseLedgers, selectReleaseNotes, type ReleaseNote } from './notes.js';
import { compareVersions, isReleaseVersion } from './version.js';

export const RELEASE_PACKAGE = 'deepseekbot';
export const RELEASE_NOTES_PACKAGE = '@botharness/core';
export const DEFAULT_RELEASE_REGISTRIES = [
  'https://registry.npmjs.org',
  'https://registry.npmmirror.com',
] as const;
export const DEFAULT_RELEASE_NOTE_SOURCES = [
  (version: string) => `https://cdn.jsdelivr.net/npm/${RELEASE_NOTES_PACKAGE}@${version}/`,
  (version: string) => `https://registry.npmmirror.com/${RELEASE_NOTES_PACKAGE}/${version}/files/`,
] as const;

const CHECK_CACHE_MS = 6 * 60 * 60 * 1000;
const FAILURE_CACHE_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;

export interface ReleaseLedgers {
  english: string;
  chinese: string;
}

export interface ReleaseInfo {
  version: string;
  releases: ReleaseNote[];
}

export type ReleaseUpdate =
  | { status: 'development'; current: string }
  | { status: 'unavailable'; current: string }
  | { status: 'current'; current: string; latest: string }
  | { status: 'available'; current: string; latest: string; releases: ReleaseNote[] };

export interface ReleaseService {
  info(since?: string): ReleaseInfo;
  update(): Promise<ReleaseUpdate>;
}

export interface ReleaseServiceOptions {
  version: () => string;
  ledgers: () => ReleaseLedgers | undefined;
  fetchImpl?: typeof fetch;
  now?: () => number;
  registries?: readonly string[];
  noteSources?: readonly ((version: string) => string)[];
  timeoutMs?: number;
}

function readFirst(candidates: readonly URL[]): string | undefined {
  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8');
    } catch {
      continue;
    }
  }
  return undefined;
}

export function installedRelease(
  moduleUrl: string,
): Pick<ReleaseServiceOptions, 'version' | 'ledgers'> {
  const ledger = (name: string): string | undefined =>
    readFirst([new URL(`../${name}`, moduleUrl), new URL(`../../../${name}`, moduleUrl)]);
  return {
    version: () => {
      const manifest = readFirst([new URL('../package.json', moduleUrl)]);
      if (manifest === undefined) return '0.0.0';
      const version: unknown = (JSON.parse(manifest) as { version?: unknown }).version;
      return typeof version === 'string' ? version : '0.0.0';
    },
    ledgers: () => {
      const english = ledger('CHANGELOG.md');
      if (english === undefined) return undefined;
      return { english, chinese: ledger('CHANGELOG.zh.md') ?? english };
    },
  };
}

function newestTag(tags: unknown, current: string): string | undefined {
  if (typeof tags !== 'object' || tags === null) return undefined;
  const source = tags as Record<string, unknown>;
  const candidates = [source['latest'], current.includes('-') ? source['next'] : undefined].filter(
    (value): value is string => typeof value === 'string' && isReleaseVersion(value),
  );
  return candidates.sort(compareVersions).at(-1);
}

export function createReleaseService(options: ReleaseServiceOptions): ReleaseService {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const registries = options.registries ?? DEFAULT_RELEASE_REGISTRIES;
  const noteSources = options.noteSources ?? DEFAULT_RELEASE_NOTE_SOURCES;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  let notes: ReleaseNote[] | undefined;
  let cached: { at: number; result: ReleaseUpdate } | undefined;
  let pending: Promise<ReleaseUpdate> | undefined;

  const installedNotes = (): ReleaseNote[] => {
    if (notes !== undefined) return notes;
    const ledgers = options.ledgers();
    notes = ledgers === undefined ? [] : pairReleaseLedgers(ledgers.english, ledgers.chinese);
    return notes;
  };

  const text = async (url: string): Promise<string | undefined> => {
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
      return response.ok ? await response.text() : undefined;
    } catch {
      return undefined;
    }
  };

  const latestVersion = async (current: string): Promise<string | undefined> => {
    for (const registry of registries) {
      const body = await text(
        `${registry.replace(/\/+$/u, '')}/-/package/${RELEASE_PACKAGE}/dist-tags`,
      );
      if (body === undefined) continue;
      try {
        const latest = newestTag(JSON.parse(body), current);
        if (latest !== undefined) return latest;
      } catch {
        continue;
      }
    }
    return undefined;
  };

  const newerNotes = async (current: string, latest: string): Promise<ReleaseNote[]> => {
    for (const source of noteSources) {
      const base = source(latest);
      const english = await text(`${base}CHANGELOG.md`);
      if (english === undefined) continue;
      const chinese = (await text(`${base}CHANGELOG.zh.md`)) ?? english;
      return selectReleaseNotes(pairReleaseLedgers(english, chinese), {
        after: current,
        through: latest,
      });
    }
    return [];
  };

  const check = async (): Promise<ReleaseUpdate> => {
    const current = options.version();
    if (!isReleaseVersion(current)) return { status: 'development', current };
    const latest = await latestVersion(current);
    if (latest === undefined) return { status: 'unavailable', current };
    if (compareVersions(latest, current) <= 0) return { status: 'current', current, latest };
    return { status: 'available', current, latest, releases: await newerNotes(current, latest) };
  };

  return {
    info(since) {
      const version = options.version();
      return {
        version,
        releases: !isReleaseVersion(version)
          ? []
          : since === undefined
            ? installedNotes().filter((note) => compareVersions(note.version, version) === 0)
            : selectReleaseNotes(installedNotes(), { after: since, through: version }),
      };
    },
    update() {
      if (cached !== undefined) {
        const age = now() - cached.at;
        const limit = cached.result.status === 'unavailable' ? FAILURE_CACHE_MS : CHECK_CACHE_MS;
        if (age < limit) return Promise.resolve(cached.result);
      }
      pending ??= check()
        .then((result) => {
          cached = { at: now(), result };
          return result;
        })
        .finally(() => {
          pending = undefined;
        });
      return pending;
    },
  };
}
