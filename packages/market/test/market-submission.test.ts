import { describe, expect, it } from 'vitest';
import { createMarket, fakeRepository, submit } from './market-harness.js';

interface BotBody {
  bot: { id: string; fullName: string; topics: string[]; headCommit: { sha: string } | null };
}

interface ErrorBody {
  error: { code: string };
}

describe('Marketplace Worker submissions', () => {
  it('lists a pasted public repository that carries the topic', async () => {
    const market = createMarket();
    market.publish(fakeRepository());

    const response = await submit(market, 'https://github.com/alice/helper-bot');

    expect(response.status).toBe(201);
    const body = (await response.json()) as BotBody;
    expect(body.bot).toMatchObject({
      id: 'R_alice_helper-bot',
      fullName: 'alice/helper-bot',
      topics: ['writing'],
      headCommit: { sha: 'abcdef1234567890abcdef1234567890abcdef12' },
    });
    const list = (await (await market.request('/v1/bots')).json()) as { bots: unknown[] };
    expect(list.bots).toHaveLength(1);
  });

  it.each([
    ['not a url', 400, 'invalid-repository-url'],
    ['https://gitlab.com/alice/helper-bot', 400, 'invalid-repository-url'],
    ['https://github.com/alice/missing', 404, 'repository-not-found'],
  ])('refuses %s', async (url, status, code) => {
    const market = createMarket();
    market.publish(fakeRepository());

    const response = await submit(market, url);

    expect(response.status).toBe(status);
    expect(((await response.json()) as ErrorBody).error.code).toBe(code);
  });

  it('accepts a .git clone URL with a trailing slash', async () => {
    const market = createMarket();
    market.publish(fakeRepository());

    expect((await submit(market, 'https://github.com/alice/helper-bot.git')).status).toBe(201);
    expect((await submit(market, 'https://github.com/alice/helper-bot/')).status).toBe(201);
  });

  it('refuses an archived repository or one without the topic', async () => {
    const market = createMarket();
    market.publish(fakeRepository({ name: 'archived-bot', archived: true }));
    market.publish(fakeRepository({ name: 'plain-repo', topics: ['writing'] }));

    const archived = await submit(market, 'https://github.com/alice/archived-bot');
    const plain = await submit(market, 'https://github.com/alice/plain-repo');

    expect(archived.status).toBe(422);
    expect(((await archived.json()) as ErrorBody).error.code).toBe('repository-archived');
    expect(plain.status).toBe(422);
    expect(((await plain.json()) as ErrorBody).error.code).toBe('repository-missing-topic');
  });

  it('hides a listed repository when a later paste finds the topic removed', async () => {
    const market = createMarket();
    const repository = fakeRepository();
    market.publish(repository);
    await submit(market, repository.htmlUrl);

    market.publish({ ...repository, topics: ['writing'] });
    const response = await submit(market, repository.htmlUrl);

    expect(((await response.json()) as ErrorBody).error.code).toBe('repository-missing-topic');
    const list = (await (await market.request('/v1/bots')).json()) as { bots: unknown[] };
    expect(list.bots).toEqual([]);
    expect(market.sqlite.prepare('SELECT visibility FROM indexed_repositories').get()).toEqual({
      visibility: 'hidden_missing',
    });
  });

  it('keeps the same entry when a repository is renamed', async () => {
    const market = createMarket();
    const repository = fakeRepository();
    market.publish(repository);
    await submit(market, repository.htmlUrl);

    market.github.repositories.clear();
    market.publish({
      ...repository,
      name: 'renamed-bot',
      htmlUrl: 'https://github.com/alice/renamed-bot',
    });
    const response = await submit(market, 'https://github.com/alice/renamed-bot');

    expect(((await response.json()) as BotBody).bot.fullName).toBe('alice/renamed-bot');
    expect(
      market.sqlite.prepare('SELECT count(*) AS total FROM indexed_repositories').get(),
    ).toEqual({ total: 1 });
  });

  it('keeps existing data and reports upstream-unavailable when GitHub fails', async () => {
    const market = createMarket();
    const repository = fakeRepository();
    market.publish(repository);
    await submit(market, repository.htmlUrl);

    market.github.down.value = true;
    const response = await submit(market, repository.htmlUrl);

    expect(response.status).toBe(502);
    expect(((await response.json()) as ErrorBody).error.code).toBe('upstream-unavailable');
    const list = (await (await market.request('/v1/bots')).json()) as { bots: unknown[] };
    expect(list.bots).toHaveLength(1);
  });

  it('refuses a blocked repository', async () => {
    const market = createMarket();
    const repository = fakeRepository();
    market.publish(repository);
    await submit(market, repository.htmlUrl);
    market.sqlite.exec("UPDATE indexed_repositories SET visibility = 'blocked'");

    const response = await submit(market, repository.htmlUrl);

    expect(response.status).toBe(403);
    expect(((await response.json()) as ErrorBody).error.code).toBe('repository-blocked');
  });
});
