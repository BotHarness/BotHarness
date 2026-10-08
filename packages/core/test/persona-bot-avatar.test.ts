import { describe, expect, it } from 'vitest';

import {
  createBotAvatarHttp,
  matchesIfNoneMatch,
  BOT_AVATAR_PATH,
} from '../src/bots/avatar-http.js';
import { isPersonaBotAvatar, MAX_PERSONA_BOT_AVATAR_BYTES } from '../src/bots/persona-bot.js';
import type { PersonaBotRegistry } from '../src/bots/registry.js';

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZFsAAAAASUVORK5CYII=';

function registryWith(avatar: string | undefined): PersonaBotRegistry {
  return {
    getHistorical: (slug: string) =>
      slug === 'ada' && avatar !== undefined
        ? ({ slug: 'ada', displayName: 'Ada', workspaces: [], createdAt: '', avatar } as never)
        : undefined,
  } as unknown as PersonaBotRegistry;
}

describe('PersonaBot avatar validation', () => {
  it('accepts bounded PNG, JPEG, and WebP data URLs', () => {
    expect(isPersonaBotAvatar(PNG)).toBe(true);
    expect(
      isPersonaBotAvatar(
        'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJQBOgCHwAP7+4AAAAA==',
      ),
    ).toBe(true);
  });

  it('rejects remote URLs, svg payloads, and strings over the budget', () => {
    expect(isPersonaBotAvatar('https://example.com/ada.png')).toBe(false);
    expect(isPersonaBotAvatar('blue')).toBe(false);
    expect(isPersonaBotAvatar('data:image/svg+xml;base64,AAAA')).toBe(false);
    const oversized =
      'data:image/png;base64,' + Buffer.alloc(MAX_PERSONA_BOT_AVATAR_BYTES + 1).toString('base64');
    expect(isPersonaBotAvatar(oversized)).toBe(false);
  });
});

describe('PersonaBot avatar route', () => {
  it('serves the stored bytes with an ETag and rejects unknown slugs', async () => {
    const http = createBotAvatarHttp(registryWith(PNG));
    const response = await http(new Request(`http://host${BOT_AVATAR_PATH}?slug=ada`));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('etag')).toMatch(/^".+"$/u);
    const etag = response.headers.get('etag')!;
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);

    const cached = await http(
      new Request(`http://host${BOT_AVATAR_PATH}?slug=ada`, {
        headers: { 'if-none-match': etag },
      }),
    );
    expect(cached.status).toBe(304);

    expect((await http(new Request(`http://host${BOT_AVATAR_PATH}`))).status).toBe(400);
    const missing = createBotAvatarHttp(registryWith(undefined));
    expect((await missing(new Request(`http://host${BOT_AVATAR_PATH}?slug=ada`))).status).toBe(404);
  });

  it('matches wildcard, list, and weak If-None-Match validators', async () => {
    const http = createBotAvatarHttp(registryWith(PNG));
    const base = await http(new Request(`http://host${BOT_AVATAR_PATH}?slug=ada`));
    const etag = base.headers.get('etag')!;

    for (const header of ['*', `"other", ${etag}`, `W/${etag}`]) {
      const response = await http(
        new Request(`http://host${BOT_AVATAR_PATH}?slug=ada`, {
          headers: { 'if-none-match': header },
        }),
      );
      expect(response.status, header).toBe(304);
    }
    expect(matchesIfNoneMatch('"other"', etag)).toBe(false);
    expect(matchesIfNoneMatch(null, etag)).toBe(false);
  });
});

it('refuses an obsolete versioned snapshot rather than serving a different saved Avatar', async () => {
  const { botAvatarUrl } = await import('../src/bots/avatar-http.js');
  const url = botAvatarUrl('ada', PNG);
  const replacement =
    'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJQBOgCHwAP7+4AAAAA==';
  const http = createBotAvatarHttp(registryWith(replacement));
  const stale = await http(new Request(`http://host${url}`));
  expect(stale.status).toBe(404);
  expect(stale.headers.get('cache-control')).toBe('no-store');
  const current = await http(new Request(`http://host${botAvatarUrl('ada', replacement)}`));
  expect(current.status).toBe(200);
  expect(current.headers.get('content-type')).toBe('image/webp');
});
