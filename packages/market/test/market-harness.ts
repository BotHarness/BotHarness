import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { D1Database, D1PreparedStatement, D1Value } from '../src/d1.js';
import type { GitHubRepository } from '../src/github.js';
import { handlerForEnv, runScheduled } from '../src/worker.js';
import { createGitHubClient } from '../src/github.js';

export function createLocalD1(): { db: D1Database; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(':memory:');
  const migrations = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(migrations).sort()) {
    sqlite.exec(readFileSync(new URL(file, migrations), 'utf8'));
  }
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
  createdAt: string;
  readme: string | null;
  descriptor: string | null;
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
    createdAt: '2026-01-01T00:00:00Z',
    readme: `# ${name}`,
    descriptor: null,
    ...overrides,
  };
}

export function createFakeGitHub(): {
  repositories: Map<string, FakeRepository>;
  down: { value: boolean };
  nodesDown: { value: boolean };
  contentsDown: { value: boolean };
  requests: string[];
  nodeBatches: number[];
  searches: string[];
  fetchImpl: typeof fetch;
} {
  const repositories = new Map<string, FakeRepository>();
  const down = { value: false };
  const nodesDown = { value: false };
  const requests: string[] = [];
  const nodeBatches: number[] = [];
  const searches: string[] = [];
  const respond = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const rest = (repository: FakeRepository) => ({
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
  });
  const graph = (repository: FakeRepository | undefined) =>
    repository === undefined || repository.private
      ? null
      : {
          id: repository.nodeId,
          name: repository.name,
          owner: { login: repository.owner },
          url: repository.htmlUrl,
          description: repository.description,
          stargazerCount: repository.stars,
          pushedAt: repository.pushedAt,
          isPrivate: repository.private,
          isArchived: repository.archived,
          repositoryTopics: { nodes: repository.topics.map((name) => ({ topic: { name } })) },
          defaultBranchRef: {
            name: repository.defaultBranch,
            target:
              repository.head === undefined
                ? {}
                : { oid: repository.head.sha, committedDate: repository.head.committedAt },
          },
        };
  const search = (url: URL): Response => {
    const query = url.searchParams.get('q') ?? '';
    searches.push(query);
    const range = /created:(\S+)\.\.(\S+)/u.exec(query);
    const from = Date.parse(range?.[1] ?? '');
    const to = Date.parse(range?.[2] ?? '');
    const page = Number(url.searchParams.get('page') ?? '1');
    const perPage = Number(url.searchParams.get('per_page') ?? '30');
    const matches = [...repositories.values()]
      .filter((repository) => !repository.private && repository.topics.includes('botharness-bot'))
      .filter((repository) => {
        const created = Date.parse(repository.createdAt);
        return created >= from && created <= to;
      })
      .sort((left, right) => left.nodeId.localeCompare(right.nodeId));
    const visible = matches.slice(0, 1000);
    return respond(200, {
      total_count: matches.length,
      incomplete_results: false,
      items: visible.slice((page - 1) * perPage, page * perPage).map(rest),
    });
  };
  const contentsDown = { value: false };
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input : input.url,
    );
    requests.push(url.pathname);
    if (down.value) return respond(503, { message: 'unavailable' });
    if (url.pathname === '/search/repositories') return search(url);
    if (url.pathname === '/graphql') {
      if (nodesDown.value) return respond(502, { message: 'bad gateway' });
      const { variables } = JSON.parse(String(init?.body)) as { variables: { ids: string[] } };
      nodeBatches.push(variables.ids.length);
      const byId = new Map([...repositories.values()].map((item) => [item.nodeId, item]));
      return respond(200, { data: { nodes: variables.ids.map((id) => graph(byId.get(id))) } });
    }
    const match = /^\/repos\/([^/]+)\/([^/]+)(?:\/(commits|readme|contents)(?:\/(.+))?)?$/u.exec(
      url.pathname,
    );
    const repository =
      match === null ? undefined : repositories.get(`${match[1]}/${match[2]}`.toLowerCase());
    if (match === null || repository === undefined || repository.private) {
      return respond(404, { message: 'Not Found' });
    }
    if (match[3] === 'readme') {
      return repository.readme === null
        ? respond(404, { message: 'Not Found' })
        : new Response(repository.readme, { status: 200 });
    }
    if (match[3] === 'contents') {
      if (contentsDown.value) return respond(503, { message: 'unavailable' });
      return match[4] !== '.botharness/bot.json' || repository.descriptor === null
        ? respond(404, { message: 'Not Found' })
        : new Response(repository.descriptor, { status: 200 });
    }
    if (match[3] === 'commits') {
      return repository.head === undefined
        ? respond(404, { message: 'Not Found' })
        : respond(200, {
            sha: repository.head.sha,
            commit: { committer: { date: repository.head.committedAt } },
          });
    }
    return respond(200, rest(repository));
  };
  return {
    repositories,
    down,
    nodesDown,
    contentsDown,
    requests,
    nodeBatches,
    searches,
    fetchImpl,
  };
}

export function createMarket(): {
  request: (path: string, init?: RequestInit) => Promise<Response>;
  github: ReturnType<typeof createFakeGitHub>;
  sqlite: DatabaseSync;
  publish: (repository: FakeRepository) => void;
  scheduled: (cron: string) => Promise<Record<string, unknown>>;
} {
  const { db, sqlite } = createLocalD1();
  const github = createFakeGitHub();
  const client = createGitHubClient({
    token: 'test-token',
    fetchImpl: github.fetchImpl,
    apiBase: 'https://api.github.test',
  });
  const handler = handlerForEnv({ MARKET_DB: db }, client);
  return {
    request: (path, init) => handler(new Request(`https://market.test${path}`, init)),
    github,
    sqlite,
    scheduled: async (cron) => {
      const lines: string[] = [];
      await runScheduled(cron, { MARKET_DB: db }, client, (line) => lines.push(line));
      return JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    },
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
