import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { D1Database, D1PreparedStatement, D1Value } from '../src/d1.js';
import type { GitHubRepository } from '../src/github.js';
import { handlerForEnv } from '../src/worker.js';
import { createGitHubClient } from '../src/github.js';

export function createLocalD1(): { db: D1Database; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(
    readFileSync(new URL('../migrations/0001_indexed_repositories.sql', import.meta.url), 'utf8'),
  );
  const statement = (query: string, values: D1Value[]): D1PreparedStatement => ({
    bind: (...next) => statement(query, next),
    first: <T>() =>
      Promise.resolve(
        (sqlite.prepare(query).get(...(values as SQLInputValue[])) ?? null) as T | null,
      ),
    all: <T>() =>
      Promise.resolve({
        results: sqlite.prepare(query).all(...(values as SQLInputValue[])) as T[],
      }),
    run: () => Promise.resolve(sqlite.prepare(query).run(...(values as SQLInputValue[]))),
  });
  return { db: { prepare: (query) => statement(query, []) }, sqlite };
}

export interface FakeRepository extends GitHubRepository {
  head?: { sha: string; committedAt: string };
}

export function fakeRepository(overrides: Partial<FakeRepository> = {}): FakeRepository {
  const owner = overrides.owner ?? 'alice';
  const name = overrides.name ?? 'helper-bot';
  return {
    nodeId: `R_${owner}_${name}`,
    owner,
    name,
    htmlUrl: `https://github.com/${owner}/${name}`,
    cloneUrl: `https://github.com/${owner}/${name}.git`,
    description: 'A helpful bot',
    topics: ['botharness-bot', 'writing'],
    stars: 3,
    pushedAt: '2026-10-01T00:00:00Z',
    defaultBranch: 'main',
    private: false,
    archived: false,
    head: { sha: 'abcdef1234567890abcdef1234567890abcdef12', committedAt: '2026-09-30T12:00:00Z' },
    ...overrides,
  };
}

export function createFakeGitHub(): {
  repositories: Map<string, FakeRepository>;
  down: { value: boolean };
  requests: string[];
  fetchImpl: typeof fetch;
} {
  const repositories = new Map<string, FakeRepository>();
  const down = { value: false };
  const requests: string[] = [];
  const respond = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fetchImpl: typeof fetch = (input) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input : input.url,
    );
    requests.push(url.pathname);
    if (down.value) return Promise.resolve(respond(503, { message: 'unavailable' }));
    const match = /^\/repos\/([^/]+)\/([^/]+)(?:\/commits\/([^/]+))?$/u.exec(url.pathname);
    const repository =
      match === null ? undefined : repositories.get(`${match[1]}/${match[2]}`.toLowerCase());
    if (match === null || repository === undefined || repository.private) {
      return Promise.resolve(respond(404, { message: 'Not Found' }));
    }
    if (match[3] !== undefined) {
      return Promise.resolve(
        repository.head === undefined
          ? respond(404, { message: 'Not Found' })
          : respond(200, {
              sha: repository.head.sha,
              commit: { committer: { date: repository.head.committedAt } },
            }),
      );
    }
    return Promise.resolve(
      respond(200, {
        node_id: repository.nodeId,
        owner: { login: repository.owner },
        name: repository.name,
        html_url: repository.htmlUrl,
        clone_url: repository.cloneUrl,
        description: repository.description,
        topics: repository.topics,
        stargazers_count: repository.stars,
        pushed_at: repository.pushedAt,
        default_branch: repository.defaultBranch,
        private: repository.private,
        archived: repository.archived,
      }),
    );
  };
  return { repositories, down, requests, fetchImpl };
}

export function createMarket(): {
  request: (path: string, init?: RequestInit) => Promise<Response>;
  github: ReturnType<typeof createFakeGitHub>;
  sqlite: DatabaseSync;
  publish: (repository: FakeRepository) => void;
} {
  const { db, sqlite } = createLocalD1();
  const github = createFakeGitHub();
  const handler = handlerForEnv(
    { MARKET_DB: db },
    createGitHubClient({ fetchImpl: github.fetchImpl, apiBase: 'https://api.github.test' }),
  );
  return {
    request: (path, init) => handler(new Request(`https://market.test${path}`, init)),
    github,
    sqlite,
    publish: (repository) =>
      github.repositories.set(`${repository.owner}/${repository.name}`.toLowerCase(), repository),
  };
}

export function submit(market: ReturnType<typeof createMarket>, url: string): Promise<Response> {
  return market.request('/v1/submissions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  });
}
