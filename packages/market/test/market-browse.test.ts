import { describe, expect, it } from 'vitest';
import { createMarket, fakeRepository, submit } from './market-harness.js';

interface PageBody {
  bots: { fullName: string }[];
  nextCursor?: string;
}

describe('Marketplace Worker browse', () => {
  it('pages listed entries by most recent push with an opaque cursor', async () => {
    const market = createMarket();
    for (const [index, name] of ['one', 'two', 'three'].entries()) {
      const repository = fakeRepository({ name, pushedAt: `2026-10-0${index + 1}T00:00:00Z` });
      market.publish(repository);
      await submit(market, repository.htmlUrl);
    }

    const first = (await (await market.request('/v1/bots?limit=2')).json()) as PageBody;
    expect(first.bots.map((bot) => bot.fullName)).toEqual(['alice/three', 'alice/two']);
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = (await (
      await market.request(`/v1/bots?limit=2&cursor=${encodeURIComponent(first.nextCursor ?? '')}`)
    ).json()) as PageBody;
    expect(second.bots.map((bot) => bot.fullName)).toEqual(['alice/one']);
    expect(second.nextCursor).toBeUndefined();
  });

  it('breaks push-time ties by node ID so pages never repeat or skip', async () => {
    const market = createMarket();
    for (const name of ['a', 'b', 'c']) {
      const repository = fakeRepository({ name });
      market.publish(repository);
      await submit(market, repository.htmlUrl);
    }

    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const query = cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`;
      const page = (await (await market.request(`/v1/bots?limit=1${query}`)).json()) as PageBody;
      seen.push(...page.bots.map((bot) => bot.fullName));
      cursor = page.nextCursor;
    } while (cursor !== undefined);

    expect(seen).toEqual(['alice/c', 'alice/b', 'alice/a']);
  });

  it('rejects a malformed cursor or limit', async () => {
    const market = createMarket();

    expect((await market.request('/v1/bots?cursor=nope')).status).toBe(400);
    expect((await market.request('/v1/bots?limit=abc')).status).toBe(400);
  });

  it('returns 404 for unknown routes and 405 for wrong methods', async () => {
    const market = createMarket();

    expect((await market.request('/v1/unknown')).status).toBe(404);
    expect((await market.request('/v1/bots', { method: 'POST' })).status).toBe(405);
    expect((await market.request('/v1/submissions')).status).toBe(405);
  });
});
