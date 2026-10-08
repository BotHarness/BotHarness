import { createHash } from 'node:crypto';

import type { PersonaBotRegistry } from './registry.js';

export const BOT_AVATAR_PATH = '/api/botharness/bot-avatar';

const avatarUrlCache = new Map<string, string>();
export function botAvatarUrl(slug: string, avatar: string): string {
  const key = `${slug}\u0000${avatar}`;
  const cached = avatarUrlCache.get(key);
  if (cached !== undefined) return cached;
  const version = createHash('sha256').update(avatar).digest('hex').slice(0, 16);
  const url = `${BOT_AVATAR_PATH}?slug=${encodeURIComponent(slug)}&v=${version}`;
  if (avatarUrlCache.size > 256) avatarUrlCache.clear();
  avatarUrlCache.set(key, url);
  return url;
}

const CACHE_CONTROL = 'private, max-age=300';

export function createBotAvatarHttp(
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
    const avatar = registry.get(slug)?.avatar;
    if (avatar === undefined || !avatar.startsWith('data:image/')) {
      return new Response('not found', { status: 404, headers: { 'cache-control': 'no-store' } });
    }
    const separator = avatar.indexOf(',');
    const mime = avatar.slice('data:'.length, separator).split(';', 1)[0] ?? 'image/webp';
    const bytes = Buffer.from(avatar.slice(separator + 1), 'base64');
    const etag = `"${createHash('sha256').update(bytes).digest('hex').slice(0, 32)}"`;
    if (matchesIfNoneMatch(request.headers.get('if-none-match'), etag)) {
      return new Response(null, { status: 304, headers: { etag, 'cache-control': CACHE_CONTROL } });
    }
    return new Response(bytes, {
      headers: {
        'content-type': mime,
        'content-length': String(bytes.length),
        etag,
        'cache-control': CACHE_CONTROL,
        'x-content-type-options': 'nosniff',
      },
    });
  };
}

export function matchesIfNoneMatch(header: string | null, etag: string): boolean {
  if (header === null) return false;
  if (header.trim() === '*') return true;
  return header.split(',').some((candidate) => {
    const value = candidate.trim();
    return value === etag || value === `W/${etag}`;
  });
}
