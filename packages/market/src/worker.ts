import {
  createCatalog,
  MAX_QUERY_LENGTH,
  type BrowseSort,
  type Catalog,
  type SubmissionRefusal,
} from './catalog.js';
import type { D1Database } from './d1.js';
import { createCrawler } from './crawl.js';
import { createGitHubClient, type GitHubClient } from './github.js';

export interface MarketEnv {
  MARKET_DB: D1Database;
  GITHUB_TOKEN?: string;
}

const refusalStatus: Record<SubmissionRefusal, number> = {
  'invalid-repository-url': 400,
  'repository-not-found': 404,
  'repository-private': 422,
  'repository-archived': 422,
  'repository-missing-topic': 422,
  'repository-blocked': 403,
  'upstream-unavailable': 502,
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function failure(status: number, code: string): Response {
  return json(status, { error: { code } });
}

function isBrowseSort(value: string): value is BrowseSort {
  return value === 'updated' || value === 'stars';
}

export function createMarketHandler(catalog: Catalog): (request: Request) => Promise<Response> {
  return async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/v1/bots') {
      if (request.method !== 'GET') return failure(405, 'method-not-allowed');
      const limitParam = url.searchParams.get('limit');
      const limit = limitParam === null ? undefined : Number(limitParam);
      if (limit !== undefined && !Number.isInteger(limit)) return failure(400, 'invalid-limit');
      const cursor = url.searchParams.get('cursor') ?? undefined;
      const sortParam = url.searchParams.get('sort') ?? 'updated';
      if (!isBrowseSort(sortParam)) return failure(400, 'invalid-sort');
      const query = url.searchParams.get('q')?.trim() ?? '';
      if ([...query].length > MAX_QUERY_LENGTH) return failure(400, 'invalid-query');
      const topic = url.searchParams.get('topic')?.trim().toLowerCase() ?? '';
      const page = await catalog.list({
        sort: sortParam,
        ...(limit === undefined ? {} : { limit }),
        ...(cursor === undefined ? {} : { cursor }),
        ...(query.length === 0 ? {} : { query }),
        ...(topic.length === 0 ? {} : { topic }),
      });
      return page === undefined ? failure(400, 'invalid-cursor') : json(200, page);
    }
    const detailId = /^\/v1\/bots\/([^/]+)$/u.exec(url.pathname)?.[1];
    if (detailId !== undefined) {
      if (request.method !== 'GET') return failure(405, 'method-not-allowed');
      let id: string;
      try {
        id = decodeURIComponent(detailId);
      } catch {
        return failure(404, 'bot-not-found');
      }
      const detail = await catalog.detail(id);
      return detail === undefined ? failure(404, 'bot-not-found') : json(200, detail);
    }
    if (url.pathname === '/v1/topics') {
      if (request.method !== 'GET') return failure(405, 'method-not-allowed');
      return json(200, { topics: await catalog.topics() });
    }
    if (url.pathname === '/v1/submissions') {
      if (request.method !== 'POST') return failure(405, 'method-not-allowed');
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return failure(400, 'invalid-repository-url');
      }
      const submitted =
        typeof body === 'object' && body !== null && 'url' in body ? body.url : undefined;
      if (typeof submitted !== 'string') return failure(400, 'invalid-repository-url');
      const result = await catalog.submit(submitted);
      return result.ok
        ? json(201, { bot: result.entry })
        : failure(refusalStatus[result.code], result.code);
    }
    return failure(404, 'not-found');
  };
}

export function handlerForEnv(
  env: MarketEnv,
  github: GitHubClient = createGitHubClient({ token: env.GITHUB_TOKEN }),
): (request: Request) => Promise<Response> {
  return createMarketHandler(createCatalog({ db: env.MARKET_DB, github, now: () => new Date() }));
}

export const DISCOVERY_CRON = '0 3 * * *';
export const REFRESH_CRON = '17 * * * *';

export async function runScheduled(
  cron: string,
  env: MarketEnv,
  github: GitHubClient = createGitHubClient({ token: env.GITHUB_TOKEN }),
  log: (line: string) => void = (line) => console.log(line),
): Promise<void> {
  const crawler = createCrawler({ db: env.MARKET_DB, github, now: () => new Date() });
  const started = Date.now();
  const phase = cron === DISCOVERY_CRON ? 'discovery' : 'refresh';
  const report = phase === 'discovery' ? await crawler.discover() : await crawler.refresh();
  log(
    JSON.stringify({
      module: 'marketplace-worker',
      initiator: 'scheduled',
      phase,
      durationMs: Date.now() - started,
      ...report,
    }),
  );
}

export default {
  fetch(request: Request, env: MarketEnv): Promise<Response> {
    return handlerForEnv(env)(request);
  },
  scheduled(
    controller: { cron: string },
    env: MarketEnv,
    context: { waitUntil(promise: Promise<unknown>): void },
  ): void {
    context.waitUntil(runScheduled(controller.cron, env));
  },
};
