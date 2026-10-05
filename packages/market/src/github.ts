export const BOT_TOPIC = 'botharness-bot';

export interface RepositoryLocator {
  owner: string;
  name: string;
}

export interface GitHubRepository {
  nodeId: string;
  owner: string;
  name: string;
  htmlUrl: string;
  cloneUrl: string;
  description: string | null;
  topics: string[];
  stars: number;
  pushedAt: string;
  defaultBranch: string;
  private: boolean;
  archived: boolean;
}

export interface GitHubCommit {
  sha: string;
  committedAt: string;
}

export type GitHubLookup<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'not-found' | 'unavailable' };

export interface GitHubClient {
  repository(locator: RepositoryLocator): Promise<GitHubLookup<GitHubRepository>>;
  headCommit(locator: RepositoryLocator, ref: string): Promise<GitHubLookup<GitHubCommit>>;
}

const repositoryUrl =
  /^https:\/\/github\.com\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/u;

export function parseRepositoryUrl(input: string): RepositoryLocator | undefined {
  const match = repositoryUrl.exec(input.trim());
  if (match === null) return undefined;
  const [, owner, name] = match;
  if (owner === undefined || name === undefined || name === '.' || name === '..') return undefined;
  return { owner, name };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function parseRepository(value: unknown): GitHubRepository | undefined {
  const source = record(value);
  const owner = text(record(source?.['owner'])?.['login']);
  const nodeId = text(source?.['node_id']);
  const name = text(source?.['name']);
  const htmlUrl = text(source?.['html_url']);
  const cloneUrl = text(source?.['clone_url']);
  const pushedAt = text(source?.['pushed_at']);
  const defaultBranch = text(source?.['default_branch']);
  if (
    source === undefined ||
    owner === undefined ||
    nodeId === undefined ||
    name === undefined ||
    htmlUrl === undefined ||
    cloneUrl === undefined ||
    pushedAt === undefined ||
    defaultBranch === undefined
  ) {
    return undefined;
  }
  const topics = Array.isArray(source['topics'])
    ? source['topics'].filter((topic): topic is string => typeof topic === 'string')
    : [];
  const stars = source['stargazers_count'];
  return {
    nodeId,
    owner,
    name,
    htmlUrl,
    cloneUrl,
    description: text(source['description']) ?? null,
    topics,
    stars: typeof stars === 'number' && Number.isFinite(stars) ? stars : 0,
    pushedAt,
    defaultBranch,
    private: source['private'] === true,
    archived: source['archived'] === true,
  };
}

function parseCommit(value: unknown): GitHubCommit | undefined {
  const source = record(value);
  const sha = text(source?.['sha']);
  const commit = record(source?.['commit']);
  const committedAt =
    text(record(commit?.['committer'])?.['date']) ?? text(record(commit?.['author'])?.['date']);
  if (sha === undefined || committedAt === undefined) return undefined;
  return { sha, committedAt };
}

export function createGitHubClient(options: {
  token?: string | undefined;
  fetchImpl?: typeof fetch;
  apiBase?: string;
}): GitHubClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBase = options.apiBase ?? 'https://api.github.com';
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'botharness-market',
    'x-github-api-version': '2022-11-28',
  };
  if (options.token !== undefined && options.token.length > 0) {
    headers['authorization'] = `Bearer ${options.token}`;
  }

  const get = async <T>(
    path: string,
    parse: (value: unknown) => T | undefined,
  ): Promise<GitHubLookup<T>> => {
    let response: Response;
    try {
      response = await fetchImpl(`${apiBase}${path}`, { headers });
    } catch {
      return { ok: false, reason: 'unavailable' };
    }
    if (response.status === 404) return { ok: false, reason: 'not-found' };
    if (!response.ok) return { ok: false, reason: 'unavailable' };
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { ok: false, reason: 'unavailable' };
    }
    const value = parse(body);
    return value === undefined ? { ok: false, reason: 'unavailable' } : { ok: true, value };
  };

  const repoPath = (locator: RepositoryLocator): string =>
    `/repos/${encodeURIComponent(locator.owner)}/${encodeURIComponent(locator.name)}`;

  return {
    repository: (locator) => get(repoPath(locator), parseRepository),
    headCommit: (locator, ref) =>
      get(`${repoPath(locator)}/commits/${encodeURIComponent(ref)}`, parseCommit),
  };
}
