import { createHash } from 'node:crypto';

import { matchesIfNoneMatch } from './avatar-http.js';
import { botBannerPng, botBannerRevision, type BotBanner } from './bot-banner.js';
import type { PersonaBotRegistry } from './registry.js';

export const BOT_BANNER_PATH = '/api/botharness/bot-banner';

export type BotBannerSummary = Extract<BotBanner, { recipe: unknown }> | { image: string };

export function botBannerSummary(slug: string, banner: BotBanner): BotBannerSummary {
  if ('recipe' in banner) return { recipe: { ...banner.recipe } };
  return {
    image: `${BOT_BANNER_PATH}?slug=${encodeURIComponent(slug)}&v=${botBannerRevision(banner)}`,
  };
}

const CACHE_CONTROL = 'private, max-age=300';

export function createBotBannerHttp(
  registry: PersonaBotRegistry,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== 'GET') {
      return new Response(null, { status: 405, headers: { allow: 'GET' } });
    }
    const url = new URL(request.url);
    const slug = url.searchParams.get('slug');
    if (slug === null || slug.length === 0) {
      return new Response('slug is required', { status: 400 });
    }
    const banner = registry.getHistorical(slug)?.banner;
    const version = url.searchParams.get('v');
    if (banner === undefined || (version !== null && version !== botBannerRevision(banner))) {
      return new Response('not found', { status: 404, headers: { 'cache-control': 'no-store' } });
    }
    const bytes = botBannerPng(banner);
    const etag = `"${createHash('sha256').update(bytes).digest('hex').slice(0, 32)}"`;
    if (matchesIfNoneMatch(request.headers.get('if-none-match'), etag)) {
      return new Response(null, { status: 304, headers: { etag, 'cache-control': CACHE_CONTROL } });
    }
    return new Response(new Uint8Array(bytes), {
      headers: {
        'content-type': 'image/png',
        'content-length': String(bytes.length),
        etag,
        'cache-control': CACHE_CONTROL,
        'x-content-type-options': 'nosniff',
      },
    });
  };
}
