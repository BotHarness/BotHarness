import type { PersonaBotRegistry } from '../bots/registry.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createMemoryGit } from './git.js';

export type OverviewMemoryBot = { slug: string; displayName: string } & (
  | { state: 'ready'; total: number; counts: number[]; dirty: boolean }
  | { state: 'unavailable' }
);
export interface OverviewMemory {
  start: string;
  end: string;
  days: string[];
  timezone: string;
  readAt: string;
  nextRefreshAt: string;
  bots: OverviewMemoryBot[];
  nextCursor?: string;
}
function localDay(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}
export function queryOverviewMemory(
  registry: PersonaBotRegistry,
  now: Date,
  after?: string,
): OverviewMemory {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  date.setDate(date.getDate() - 6);
  const since = date.toISOString();
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(localDay(date));
    date.setDate(date.getDate() + 1);
  }
  const rows = registry
    .list()
    .filter((bot) => bot.slug > (after ?? ''))
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const bots: OverviewMemoryBot[] = rows.slice(0, 10).map((bot) => {
    const identity = { slug: bot.slug, displayName: bot.displayName };
    const memoryDir = registry.memoryDirFor(bot.slug);
    if (!memoryDir || !existsSync(join(memoryDir, '.git')))
      return { ...identity, state: 'unavailable' };
    try {
      const snapshot = createMemoryGit(memoryDir).activitySnapshot(since);
      const counts = days.map(() => 0);
      for (const { at } of snapshot.commits) {
        const instant = new Date(at);
        if (!Number.isFinite(instant.getTime())) throw new Error('Invalid Memory commit date');
        const index = days.indexOf(localDay(instant));
        if (index >= 0) counts[index] = counts[index]! + 1;
      }
      return {
        ...identity,
        state: 'ready',
        counts,
        total: counts.reduce((sum, count) => sum + count, 0),
        dirty: snapshot.dirty,
      };
    } catch {
      return { ...identity, state: 'unavailable' };
    }
  });
  return {
    start: days[0]!,
    end: days[6]!,
    days,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    readAt: now.toISOString(),
    nextRefreshAt: date.toISOString(),
    bots,
    ...(rows.length > 10 ? { nextCursor: bots[9]!.slug } : {}),
  };
}
