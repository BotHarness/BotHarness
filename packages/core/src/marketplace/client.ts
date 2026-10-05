export interface MarketplaceEntry {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  displayName: string | null;
  roles: string[];
  description: string | null;
  topics: string[];
  stars: number;
  pushedAt: string;
  htmlUrl: string;
  cloneUrl: string;
  defaultBranch: string;
  headCommit: { sha: string; committedAt: string } | null;
}

export interface MarketplacePage {
  bots: MarketplaceEntry[];
  nextCursor?: string;
}

export type MarketplaceSort = 'updated' | 'stars';

export interface MarketplaceQuery {
  cursor?: string;
  sort?: MarketplaceSort;
  q?: string;
  topic?: string;
}

export interface MarketplaceTopic {
  topic: string;
  count: number;
}

export interface MarketplaceDetail {
  bot: MarketplaceEntry;
  readme: string | null;
  commitSha: string | null;
}

export type MarketplaceResult<T> = { ok: true; value: T } | { ok: false; code: string };

export interface MarketplaceClient {
  list(query: MarketplaceQuery): Promise<MarketplaceResult<MarketplacePage>>;
  topics(): Promise<MarketplaceResult<MarketplaceTopic[]>>;
  detail(id: string): Promise<MarketplaceResult<MarketplaceDetail>>;
  submit(url: string): Promise<MarketplaceResult<{ bot: MarketplaceEntry }>>;
}

const REQUEST_TIMEOUT_MS = 15_000;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseEntry(value: unknown): MarketplaceEntry | undefined {
  const source = record(value);
  if (source === undefined) return undefined;
  const strings = [
    'id',
    'owner',
    'name',
    'fullName',
    'pushedAt',
    'htmlUrl',
    'cloneUrl',
    'defaultBranch',
  ] as const;
  if (!strings.every((key) => typeof source[key] === 'string')) return undefined;
  const description = source['description'];
  const stars = source['stars'];
  const topics = source['topics'];
  const head = record(source['headCommit']);
  if (description !== null && typeof description !== 'string') return undefined;
  if (typeof stars !== 'number' || !Array.isArray(topics)) return undefined;
  const displayName = source['displayName'];
  const roles = source['roles'];
  return {
    id: source['id'] as string,
    owner: source['owner'] as string,
    name: source['name'] as string,
    fullName: source['fullName'] as string,
    displayName: typeof displayName === 'string' && displayName.length > 0 ? displayName : null,
    roles: Array.isArray(roles)
      ? roles.filter((role): role is string => typeof role === 'string')
      : [],
    description,
    topics: topics.filter((topic): topic is string => typeof topic === 'string'),
    stars,
    pushedAt: source['pushedAt'] as string,
    htmlUrl: source['htmlUrl'] as string,
    cloneUrl: source['cloneUrl'] as string,
    defaultBranch: source['defaultBranch'] as string,
    headCommit:
      head !== undefined &&
      typeof head['sha'] === 'string' &&
      typeof head['committedAt'] === 'string'
        ? { sha: head['sha'], committedAt: head['committedAt'] }
        : null,
  };
}

export function parseMarketplacePage(value: unknown): MarketplacePage | undefined {
  const source = record(value);
  if (source === undefined || !Array.isArray(source['bots'])) return undefined;
  const bots = source['bots'].map(parseEntry);
  if (!bots.every((bot): bot is MarketplaceEntry => bot !== undefined)) return undefined;
  const nextCursor = source['nextCursor'];
  return typeof nextCursor === 'string' ? { bots, nextCursor } : { bots };
}

export function parseMarketplaceDetail(value: unknown): MarketplaceDetail | undefined {
  const source = record(value);
  const bot = parseEntry(source?.['bot']);
  const readme = source?.['readme'];
  const commitSha = source?.['commitSha'];
  if (bot === undefined || (readme !== null && typeof readme !== 'string')) return undefined;
  if (commitSha !== null && typeof commitSha !== 'string') return undefined;
  return { bot, readme, commitSha };
}

export function parseMarketplaceTopics(value: unknown): MarketplaceTopic[] | undefined {
  const topics = record(value)?.['topics'];
  if (!Array.isArray(topics)) return undefined;
  const parsed = topics.map((item) => {
    const source = record(item);
    return typeof source?.['topic'] === 'string' && typeof source['count'] === 'number'
      ? { topic: source['topic'], count: source['count'] }
      : undefined;
  });
  return parsed.every((item): item is MarketplaceTopic => item !== undefined) ? parsed : undefined;
}

function listPath(query: MarketplaceQuery): string {
  const params = new URLSearchParams();
  if (query.sort !== undefined) params.set('sort', query.sort);
  if (query.q !== undefined) params.set('q', query.q);
  if (query.topic !== undefined) params.set('topic', query.topic);
  if (query.cursor !== undefined) params.set('cursor', query.cursor);
  const search = params.toString();
  return search.length === 0 ? '/v1/bots' : `/v1/bots?${search}`;
}

export function parseMarketplaceSubmission(value: unknown): { bot: MarketplaceEntry } | undefined {
  const bot = parseEntry(record(value)?.['bot']);
  return bot === undefined ? undefined : { bot };
}

export function createMarketplaceClient(options: {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): MarketplaceClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/+$/u, '');
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;

  const request = async <T>(
    path: string,
    init: RequestInit,
    parse: (value: unknown) => T | undefined,
  ): Promise<MarketplaceResult<T>> => {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return { ok: false, code: 'marketplace-unavailable' };
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { ok: false, code: 'marketplace-unavailable' };
    }
    if (!response.ok) {
      const code = record(record(body)?.['error'])?.['code'];
      return { ok: false, code: typeof code === 'string' ? code : 'marketplace-unavailable' };
    }
    const value = parse(body);
    return value === undefined
      ? { ok: false, code: 'marketplace-unavailable' }
      : { ok: true, value };
  };

  return {
    list: (query) =>
      request(
        listPath(query),
        { method: 'GET', headers: { accept: 'application/json' } },
        parseMarketplacePage,
      ),
    detail: (id) =>
      request(
        `/v1/bots/${encodeURIComponent(id)}`,
        { method: 'GET', headers: { accept: 'application/json' } },
        parseMarketplaceDetail,
      ),
    topics: () =>
      request(
        '/v1/topics',
        { method: 'GET', headers: { accept: 'application/json' } },
        parseMarketplaceTopics,
      ),
    submit: (url) =>
      request(
        '/v1/submissions',
        {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify({ url }),
        },
        parseMarketplaceSubmission,
      ),
  };
}
