import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store';

import { parseReleaseNotes, type ReleaseNote } from '../../../core/src/release/notes.js';
import type { ReleaseInfo, ReleaseUpdate } from '../../../core/src/release/service.js';
import { compareVersions, isReleaseVersion } from '../../../core/src/release/version.js';
import type { BridgeCall } from './bridge.js';
import type { ConfigStorage } from './roster-config.js';

export const RELEASE_NOTES_SEEN_KEY = 'botharness.releaseNotes.seenVersion';

export type ReleaseUpdateState = { status: 'idle' } | { status: 'checking' } | ReleaseUpdate;

export interface ReleaseNotesSnapshot {
  version: string | undefined;
  announcement: ReleaseNote[] | undefined;
  firstRun: boolean;
  viewing: ReleaseNote[] | undefined;
  update: ReleaseUpdateState;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function parseReleaseInfo(value: unknown): ReleaseInfo | undefined {
  const source = record(value);
  const releases = parseReleaseNotes(source?.['releases']);
  return typeof source?.['version'] === 'string' && releases !== undefined
    ? { version: source['version'], releases }
    : undefined;
}

export function parseReleaseUpdate(value: unknown): ReleaseUpdate | undefined {
  const source = record(value);
  const current = source?.['current'];
  const latest = source?.['latest'];
  if (typeof current !== 'string') return undefined;
  switch (source?.['status']) {
    case 'development':
    case 'unavailable':
      return { status: source['status'], current };
    case 'current':
      return typeof latest === 'string' ? { status: 'current', current, latest } : undefined;
    case 'available': {
      const releases = parseReleaseNotes(source['releases']);
      return typeof latest === 'string' && releases !== undefined
        ? { status: 'available', current, latest, releases }
        : undefined;
    }
    default:
      return undefined;
  }
}

function readSeen(storage: ConfigStorage | undefined): string | undefined {
  try {
    const value = storage?.getItem(RELEASE_NOTES_SEEN_KEY);
    return value !== null && value !== undefined && isReleaseVersion(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export class ReleaseNotesController {
  readonly source: SnapshotStore<ReleaseNotesSnapshot>;

  private readonly call: BridgeCall;
  private readonly storage: ConfigStorage | undefined;
  private started: Promise<void> | undefined;

  constructor(call: BridgeCall, storage: ConfigStorage | undefined) {
    this.call = call;
    this.storage = storage;
    this.source = createSnapshotStore<ReleaseNotesSnapshot>({
      version: undefined,
      announcement: undefined,
      firstRun: false,
      viewing: undefined,
      update: { status: 'idle' },
    });
  }

  start(): Promise<void> {
    this.started ??= this.announce().catch((error: unknown) => {
      this.started = undefined;
      console.warn('botharness: failed to read release notes', error);
    });
    return this.started;
  }

  dismiss(): void {
    const version = this.source.getSnapshot().version;
    if (version !== undefined && isReleaseVersion(version)) {
      try {
        this.storage?.setItem(RELEASE_NOTES_SEEN_KEY, version);
      } catch {
        console.warn('botharness: failed to remember the seen release');
      }
    }
    this.source.update((draft) => {
      draft.announcement = undefined;
    });
  }

  view(releases: ReleaseNote[] | undefined): void {
    this.source.update((draft) => {
      draft.viewing = releases;
    });
  }

  async checkUpdate(force = false): Promise<void> {
    const current = this.source.getSnapshot().update.status;
    if (current === 'checking' || (!force && current !== 'idle')) return;
    this.source.update((draft) => {
      draft.update = { status: 'checking' };
    });
    let update: ReleaseUpdate | undefined;
    try {
      const result = await this.call('releaseUpdate', {});
      update = result.ok ? parseReleaseUpdate(result.value) : undefined;
    } catch {
      update = undefined;
    }
    this.source.update((draft) => {
      draft.update = update ?? { status: 'unavailable', current: draft.version ?? '' };
    });
  }

  private async announce(): Promise<void> {
    const seen = readSeen(this.storage);
    const result = await this.call('releaseInfo', seen === undefined ? {} : { since: seen });
    if (!result.ok) throw new Error(result.error.message);
    const info = parseReleaseInfo(result.value);
    if (info === undefined) throw new Error('invalid releaseInfo response');
    const fresh =
      isReleaseVersion(info.version) &&
      (seen === undefined || compareVersions(info.version, seen) > 0);
    this.source.update((draft) => {
      draft.version = info.version;
      draft.announcement = fresh && info.releases.length > 0 ? info.releases : undefined;
      draft.firstRun = seen === undefined;
    });
    if (fresh && info.releases.length === 0) this.dismiss();
  }
}
