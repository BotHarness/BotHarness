import { describe, expect, it } from 'vitest';
import { MAX_DESCRIPTOR_BYTES, parseBotDescriptor } from '../../core/src/marketplace/descriptor.js';
import { createMarket, fakeRepository, submit } from './market-harness.js';

describe('bot.json descriptor', () => {
  it('keeps a valid name, roles and avatar', () => {
    expect(
      parseBotDescriptor(
        JSON.stringify({
          name: '  Pixel Painter ',
          roles: ['artist', ' reviewer ', 'artist'],
          avatar: { image: './assets/avatar.png' },
          extra: 'ignored',
        }),
      ),
    ).toEqual({
      name: 'Pixel Painter',
      roles: ['artist', 'reviewer'],
      avatar: { image: 'assets/avatar.png' },
    });
    expect(parseBotDescriptor('{"avatar":{"recipe":{"family":"illustrated"}}}')).toEqual({
      avatar: { recipe: { family: 'illustrated' } },
    });
    expect(parseBotDescriptor('{}')).toEqual({});
  });

  it.each([
    ['not JSON', '{name:'],
    ['an array', '[]'],
    ['a numeric name', '{"name":3}'],
    ['an empty name', '{"name":"  "}'],
    ['a long name', JSON.stringify({ name: 'x'.repeat(61) })],
    ['too many roles', JSON.stringify({ roles: Array.from({ length: 9 }, (_, i) => `r${i}`) })],
    ['a non-string role', '{"roles":["ok",1]}'],
    ['a path traversal', '{"avatar":{"image":"../secret.png"}}'],
    ['an absolute path', '{"avatar":{"image":"/etc/avatar.png"}}'],
    ['a URL', '{"avatar":{"image":"https://evil.example/a.png"}}'],
    ['a non-image file', '{"avatar":{"image":"avatar.svg"}}'],
    ['both recipe and image', '{"avatar":{"recipe":{},"image":"a.png"}}'],
    ['an oversized file', JSON.stringify({ name: 'a', pad: 'x'.repeat(MAX_DESCRIPTOR_BYTES) })],
  ])('rejects %s', (_, text) => {
    expect(parseBotDescriptor(text)).toBeUndefined();
  });
});

describe('Marketplace Worker presentation', () => {
  it('lists the descriptor name and role badges', async () => {
    const market = createMarket();
    const repository = fakeRepository({
      descriptor: JSON.stringify({ name: 'Helper', roles: ['writer', 'editor'] }),
    });
    market.publish(repository);

    const response = await submit(market, repository.htmlUrl);

    expect(await response.json()).toMatchObject({
      bot: { name: 'helper-bot', displayName: 'Helper', roles: ['writer', 'editor'] },
    });
  });

  it('keeps defaults and the entry when the descriptor is missing or invalid', async () => {
    const market = createMarket();
    const missing = fakeRepository({ name: 'missing' });
    const invalid = fakeRepository({ name: 'invalid', descriptor: '{"name": 42}' });
    market.publish(missing);
    market.publish(invalid);

    for (const repository of [missing, invalid]) {
      const response = await submit(market, repository.htmlUrl);
      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({ bot: { displayName: null, roles: [] } });
    }
  });

  it('refetches the descriptor only after a push', async () => {
    const market = createMarket();
    const repository = fakeRepository({ descriptor: '{"name":"First"}' });
    market.publish(repository);
    await submit(market, repository.htmlUrl);

    market.publish({ ...repository, descriptor: '{"name":"Second"}' });
    await market.scheduled('17 * * * *');
    const unchanged = (await (await market.request('/v1/bots')).json()) as {
      bots: { displayName: string }[];
    };
    expect(unchanged.bots[0]?.displayName).toBe('First');

    market.publish({
      ...repository,
      descriptor: '{"name":"Second"}',
      pushedAt: '2026-10-02T00:00:00Z',
    });
    await market.scheduled('17 * * * *');
    const changed = (await (await market.request('/v1/bots')).json()) as {
      bots: { displayName: string }[];
    };
    expect(changed.bots[0]?.displayName).toBe('Second');
  });

  it('keeps the last good presentation when the descriptor fetch fails', async () => {
    const market = createMarket();
    const repository = fakeRepository({ descriptor: '{"name":"Kept"}' });
    market.publish(repository);
    await submit(market, repository.htmlUrl);

    market.publish({
      ...repository,
      pushedAt: '2026-10-02T00:00:00Z',
      descriptor: '{"name":"New"}',
    });
    market.github.contentsDown.value = true;
    await market.scheduled('17 * * * *');
    market.github.contentsDown.value = false;

    expect(market.github.requests).toContain(
      '/repos/alice/helper-bot/contents/.botharness/bot.json',
    );
    const page = (await (await market.request('/v1/bots')).json()) as {
      bots: { displayName: string }[];
    };
    expect(page.bots[0]?.displayName).toBe('Kept');
  });
});
