import { createCatalog, type Catalog, type SubmissionRefusal } from './catalog.js';
import type { D1Database } from './d1.js';
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

export function createMarketHandler(catalog: Catalog): (request: Request) => Promise<Response> {
  return async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/v1/bots') {
      if (request.method !== 'GET') return failure(405, 'method-not-allowed');
      const limitParam = url.searchParams.get('limit');
      const limit = limitParam === null ? undefined : Number(limitParam);
      if (limit !== undefined && !Number.isInteger(limit)) return failure(400, 'invalid-limit');
      const cursor = url.searchParams.get('cursor') ?? undefined;
      const page = await catalog.list({
        ...(limit === undefined ? {} : { limit }),
        ...(cursor === undefined ? {} : { cursor }),
      });
      return page === undefined ? failure(400, 'invalid-cursor') : json(200, page);
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

export default {
  fetch(request: Request, env: MarketEnv): Promise<Response> {
    return handlerForEnv(env)(request);
  },
};
