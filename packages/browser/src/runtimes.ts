import { dirname, join } from 'node:path';
import { readdir } from 'node:fs/promises';

import {
  createBotBrowserRuntime,
  type BotBrowserRuntime,
  type BotBrowserRuntimeOptions,
} from './runtime/browser.js';

export interface BotBrowserRuntimes {
  for(slug: string): BotBrowserRuntime;
  touch(slug: string): void;
  closeIdle(idleMs: number): Promise<void>;
  stop(slug: string): Promise<void>;
  stopAll(): Promise<void>;
  profileOf(slug: string): string;
}

export interface BotBrowserRuntimesOptions {
  readonly browserDir: string;
  readonly installDir: string;
  readonly browserPath?: string;
  readonly headless?: boolean;
  readonly onEvent?: (detail: string) => void;
  readonly profileOf: (slug: string) => string;
  readonly create?: (options: BotBrowserRuntimeOptions) => BotBrowserRuntime;
}

const PROFILE_NAME = /^[a-zA-Z0-9._-]{1,40}$/u;

export function sanitizeProfileName(value: string): string {
  const trimmed = value.trim();
  if (trimmed === 'default' || trimmed === '.' || trimmed === '..') return '';
  return PROFILE_NAME.test(trimmed) ? trimmed : '';
}

export async function listStoredProfileNames(browserDir: string): Promise<readonly string[]> {
  try {
    const entries = await readdir(join(dirname(browserDir), 'browser-profiles'), {
      withFileTypes: true,
    });
    return entries
      .filter((entry) => entry.isDirectory() && sanitizeProfileName(entry.name) === entry.name)
      .map((entry) => entry.name)
      .sort();
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return [];
    throw cause;
  }
}

export function createBotBrowserRuntimes(options: BotBrowserRuntimesOptions): BotBrowserRuntimes {
  const create = options.create ?? createBotBrowserRuntime;
  const entries = new Map<string, { runtime: BotBrowserRuntime; lastActivity: number }>();

  const profileOf = (slug: string): string => sanitizeProfileName(options.profileOf(slug));

  const directoryFor = (profile: string): string =>
    profile === ''
      ? options.browserDir
      : join(dirname(options.browserDir), 'browser-profiles', profile);

  const entryFor = (slug: string): { runtime: BotBrowserRuntime; lastActivity: number } => {
    const profile = profileOf(slug);
    const existing = entries.get(profile);
    if (existing !== undefined) return existing;
    const created = {
      runtime: create({
        ...(options.browserPath === undefined ? {} : { browserPath: options.browserPath }),
        userDataDir: directoryFor(profile),
        installDir: options.installDir,
        ...(options.headless === true ? { headless: true } : {}),
        onEvent: (detail) =>
          options.onEvent?.(`[${profile === '' ? 'default' : profile}] ${detail}`),
      }),
      lastActivity: Date.now(),
    };
    entries.set(profile, created);
    return created;
  };

  return {
    for(slug) {
      return entryFor(slug).runtime;
    },
    touch(slug) {
      entryFor(slug).lastActivity = Date.now();
    },
    async closeIdle(idleMs) {
      for (const entry of entries.values()) {
        if (!entry.runtime.isRunning()) continue;
        if (Date.now() - entry.lastActivity < idleMs) continue;
        await entry.runtime.stop().catch(() => undefined);
      }
    },
    async stop(slug) {
      const profile = profileOf(slug);
      const entry = entries.get(profile);
      if (entry === undefined) return;
      await entry.runtime.stop().catch(() => undefined);
      entries.delete(profile);
    },
    async stopAll() {
      for (const entry of entries.values()) {
        await entry.runtime.stop().catch(() => undefined);
      }
      entries.clear();
    },
    profileOf,
  };
}
