import type { D1Database } from './d1.js';
import {
  SEARCH_PAGE_SIZE,
  type CreatedRange,
  type GitHubClient,
  type GitHubRepository,
} from './github.js';
import { createRepositoryStore } from './repositories.js';

export const SEARCH_RESULT_CAP = 1000;
export const NODE_BATCH_SIZE = 100;
export const DISCOVERY_START = '2008-01-01T00:00:00Z';

export interface DiscoveryReport {
  complete: boolean;
  slices: number;
  found: number;
  added: number;
  hidden: number;
}

export interface RefreshReport {
  batches: number;
  failedBatches: number;
  refreshed: number;
  hidden: number;
}

function iso(time: number): string {
  return new Date(time).toISOString().replace(/\.\d{3}Z$/u, 'Z');
}

export function createCrawler(deps: { db: D1Database; github: GitHubClient; now: () => Date }) {
  const { github } = deps;
  const store = createRepositoryStore(deps);

  const refreshIds = async (ids: readonly string[]): Promise<RefreshReport> => {
    const report: RefreshReport = { batches: 0, failedBatches: 0, refreshed: 0, hidden: 0 };
    for (let start = 0; start < ids.length; start += NODE_BATCH_SIZE) {
      const batch = ids.slice(start, start + NODE_BATCH_SIZE);
      report.batches += 1;
      const result = await github.nodes(batch);
      if (!result.ok || result.value.length !== batch.length) {
        report.failedBatches += 1;
        continue;
      }
      for (const [index, node] of result.value.entries()) {
        const id = batch[index];
        if (id === undefined) continue;
        if (node === null) {
          if (await store.hide(id)) report.hidden += 1;
          continue;
        }
        const before = await store.find(node.nodeId);
        const row = await store.index(node, node.head);
        report.refreshed += 1;
        if (before?.visibility === 'listed' && row?.visibility !== 'listed') report.hidden += 1;
      }
    }
    return report;
  };

  const scan = async (
    range: { from: number; to: number },
    found: Map<string, GitHubRepository>,
    report: DiscoveryReport,
  ): Promise<boolean> => {
    const slice: CreatedRange = { from: iso(range.from), to: iso(range.to) };
    const first = await github.searchTopic(slice, 1);
    report.slices += 1;
    if (!first.ok) return false;
    if (first.value.totalCount >= SEARCH_RESULT_CAP && range.to - range.from >= 2000) {
      const middle = range.from + Math.floor((range.to - range.from) / 2000) * 1000;
      const left = await scan({ from: range.from, to: middle }, found, report);
      const right = await scan({ from: middle + 1000, to: range.to }, found, report);
      return left && right;
    }
    for (const repository of first.value.repositories) found.set(repository.nodeId, repository);
    const total = Math.min(first.value.totalCount, SEARCH_RESULT_CAP);
    const pages = Math.ceil(total / SEARCH_PAGE_SIZE);
    for (let page = 2; page <= pages; page += 1) {
      const next = await github.searchTopic(slice, page);
      if (!next.ok) return false;
      for (const repository of next.value.repositories) found.set(repository.nodeId, repository);
    }
    return first.value.totalCount < SEARCH_RESULT_CAP;
  };

  return {
    refresh: async (): Promise<RefreshReport> => refreshIds(await store.refreshableIds()),

    async discover(): Promise<DiscoveryReport> {
      const report: DiscoveryReport = { complete: false, slices: 0, found: 0, added: 0, hidden: 0 };
      const found = new Map<string, GitHubRepository>();
      const now = Math.floor(deps.now().getTime() / 1000) * 1000;
      report.complete = await scan({ from: Date.parse(DISCOVERY_START), to: now }, found, report);
      report.found = found.size;
      const added: string[] = [];
      for (const repository of found.values()) {
        const before = await store.find(repository.nodeId);
        const row = await store.index(repository, undefined);
        if (before === null && row !== null) added.push(repository.nodeId);
      }
      report.added = added.length;
      if (report.complete) {
        for (const id of await store.listedIds()) {
          if (!found.has(id) && (await store.hide(id))) report.hidden += 1;
        }
      }
      if (added.length > 0) await refreshIds(added);
      return report;
    },
  };
}
