import type { D1Database } from './d1.js';
import {
  BOT_TOPIC,
  parseRepositoryUrl,
  type GitHubClient,
  type GitHubCommit,
  type GitHubRepository,
} from './github.js';

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

interface RepositoryRow {
  node_id: string;
  owner: string;
  name: string;
  html_url: string;
  clone_url: string;
  description: string | null;
  topics: string;
  stars: number;
  pushed_at: string;
  default_branch: string;
  head_sha: string | null;
  head_committed_at: string | null;
  visibility: string;
}

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

  const findRow = (nodeId: string): Promise<RepositoryRow | null> =>
    db
      .prepare('SELECT * FROM indexed_repositories WHERE node_id = ?')
      .bind(nodeId)
      .first<RepositoryRow>();

  const hideMissing = async (nodeId: string): Promise<void> => {
    await db
      .prepare(
        "UPDATE indexed_repositories SET visibility = 'hidden_missing', last_refreshed_at = ? WHERE node_id = ? AND visibility = 'listed'",
      )
      .bind(deps.now().toISOString(), nodeId)
      .run();
  };

  const upsert = async (
    repository: GitHubRepository,
    commit: GitHubCommit | undefined,
  ): Promise<void> => {
    const now = deps.now().toISOString();
    await db
      .prepare(
        `INSERT INTO indexed_repositories (
          node_id, owner, name, html_url, clone_url, description, topics, stars, pushed_at,
          default_branch, head_sha, head_committed_at, visibility, first_seen_at, last_refreshed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'listed', ?, ?)
        ON CONFLICT (node_id) DO UPDATE SET
          owner = excluded.owner,
          name = excluded.name,
          html_url = excluded.html_url,
          clone_url = excluded.clone_url,
          description = excluded.description,
          topics = excluded.topics,
          stars = excluded.stars,
          pushed_at = excluded.pushed_at,
          default_branch = excluded.default_branch,
          head_sha = excluded.head_sha,
          head_committed_at = excluded.head_committed_at,
          visibility = CASE WHEN indexed_repositories.visibility = 'hidden_missing' THEN 'listed' ELSE indexed_repositories.visibility END,
          last_refreshed_at = excluded.last_refreshed_at`,
      )
      .bind(
        repository.nodeId,
        repository.owner,
        repository.name,
        repository.htmlUrl,
        repository.cloneUrl,
        repository.description,
        JSON.stringify(repository.topics),
        repository.stars,
        repository.pushedAt,
        repository.defaultBranch,
        commit?.sha ?? null,
        commit?.committedAt ?? null,
        now,
        now,
      )
      .run();
  };

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
      const existing = await findRow(repository.nodeId);
      if (existing?.visibility === 'blocked') return { ok: false, code: 'repository-blocked' };
      if (repository.private) return { ok: false, code: 'repository-private' };
      if (repository.archived) {
        await hideMissing(repository.nodeId);
        return { ok: false, code: 'repository-archived' };
      }
      if (!repository.topics.includes(BOT_TOPIC)) {
        await hideMissing(repository.nodeId);
        return { ok: false, code: 'repository-missing-topic' };
      }
      const commit = await github.headCommit(
        { owner: repository.owner, name: repository.name },
        repository.defaultBranch,
      );
      if (!commit.ok && commit.reason === 'unavailable') {
        return { ok: false, code: 'upstream-unavailable' };
      }
      await upsert(repository, commit.ok ? commit.value : undefined);
      const row = await findRow(repository.nodeId);
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
