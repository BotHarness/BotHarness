import type { D1Database } from './d1.js';
import { BOT_TOPIC, parseRepositoryUrl, type GitHubClient } from './github.js';
import { createRepositoryStore, isEligible, type RepositoryRow } from './repositories.js';

export interface MarketplaceEntry {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  topics: string[];
  stars: number;
  pushedAt: string;
  htmlUrl: string;
  cloneUrl: string;
  defaultBranch: string;
  headCommit: { sha: string; committedAt: string } | null;
}

export type SubmissionRefusal =
  | 'invalid-repository-url'
  | 'repository-not-found'
  | 'repository-private'
  | 'repository-archived'
  | 'repository-missing-topic'
  | 'repository-blocked'
  | 'upstream-unavailable';

export type SubmissionResult =
  | { ok: true; entry: MarketplaceEntry }
  | { ok: false; code: SubmissionRefusal };

export interface MarketplacePage {
  bots: MarketplaceEntry[];
  nextCursor?: string;
}

export const DEFAULT_PAGE_SIZE = 30;
export const MAX_PAGE_SIZE = 50;

function entryFromRow(row: RepositoryRow): MarketplaceEntry {
  let topics: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.topics);
    if (Array.isArray(parsed)) {
      topics = parsed.filter(
        (topic): topic is string => typeof topic === 'string' && topic !== BOT_TOPIC,
      );
    }
  } catch {
    topics = [];
  }
  return {
    id: row.node_id,
    owner: row.owner,
    name: row.name,
    fullName: `${row.owner}/${row.name}`,
    description: row.description,
    topics,
    stars: row.stars,
    pushedAt: row.pushed_at,
    htmlUrl: row.html_url,
    cloneUrl: row.clone_url,
    defaultBranch: row.default_branch,
    headCommit:
      row.head_sha !== null && row.head_committed_at !== null
        ? { sha: row.head_sha, committedAt: row.head_committed_at }
        : null,
  };
}

export function encodeCursor(pushedAt: string, nodeId: string): string {
  return btoa(JSON.stringify([pushedAt, nodeId]));
}

export function decodeCursor(cursor: string): { pushedAt: string; nodeId: string } | undefined {
  try {
    const parsed: unknown = JSON.parse(atob(cursor));
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === 'string' &&
      typeof parsed[1] === 'string'
    ) {
      return { pushedAt: parsed[0], nodeId: parsed[1] };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export interface Catalog {
  submit(url: string): Promise<SubmissionResult>;
  list(options: { limit?: number; cursor?: string }): Promise<MarketplacePage | undefined>;
}

export function createCatalog(deps: {
  db: D1Database;
  github: GitHubClient;
  now: () => Date;
}): Catalog {
  const { db, github } = deps;

  const store = createRepositoryStore(deps);

  return {
    async submit(url) {
      const locator = parseRepositoryUrl(url);
      if (locator === undefined) return { ok: false, code: 'invalid-repository-url' };
      const lookup = await github.repository(locator);
      if (!lookup.ok) {
        return {
          ok: false,
          code: lookup.reason === 'not-found' ? 'repository-not-found' : 'upstream-unavailable',
        };
      }
      const repository = lookup.value;
      const existing = await store.find(repository.nodeId);
      if (existing?.visibility === 'blocked') return { ok: false, code: 'repository-blocked' };
      if (repository.private) return { ok: false, code: 'repository-private' };
      if (!isEligible(repository)) {
        if (existing !== null) await store.index(repository, undefined);
        return {
          ok: false,
          code: repository.archived ? 'repository-archived' : 'repository-missing-topic',
        };
      }
      const commit = await github.headCommit(
        { owner: repository.owner, name: repository.name },
        repository.defaultBranch,
      );
      if (!commit.ok && commit.reason === 'unavailable') {
        return { ok: false, code: 'upstream-unavailable' };
      }
      const row = await store.index(repository, commit.ok ? commit.value : null);
      if (row === null) return { ok: false, code: 'upstream-unavailable' };
      if (row.visibility !== 'listed') return { ok: false, code: 'repository-blocked' };
      return { ok: true, entry: entryFromRow(row) };
    },

    async list(options) {
      const limit = Math.min(Math.max(options.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
      let after: { pushedAt: string; nodeId: string } | undefined;
      if (options.cursor !== undefined) {
        after = decodeCursor(options.cursor);
        if (after === undefined) return undefined;
      }
      const statement =
        after === undefined
          ? db
              .prepare(
                "SELECT * FROM indexed_repositories WHERE visibility = 'listed' ORDER BY pushed_at DESC, node_id DESC LIMIT ?",
              )
              .bind(limit + 1)
          : db
              .prepare(
                "SELECT * FROM indexed_repositories WHERE visibility = 'listed' AND (pushed_at < ? OR (pushed_at = ? AND node_id < ?)) ORDER BY pushed_at DESC, node_id DESC LIMIT ?",
              )
              .bind(after.pushedAt, after.pushedAt, after.nodeId, limit + 1);
      const { results } = await statement.all<RepositoryRow>();
      const page = results.slice(0, limit);
      const last = page.at(-1);
      return results.length > limit && last !== undefined
        ? { bots: page.map(entryFromRow), nextCursor: encodeCursor(last.pushed_at, last.node_id) }
        : { bots: page.map(entryFromRow) };
    },
  };
}
