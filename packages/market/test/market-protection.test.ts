import { describe, expect, it } from 'vitest';
import {
  createChallenge,
  encodeSolution,
  parseChallenge,
  solveChallenge,
  TIER_MAX_NUMBER,
} from '../../core/src/marketplace/altcha.js';
import {
  admin,
  createMarket,
  fakeRepository,
  post,
  report,
  solve,
  submit,
} from './market-harness.js';

async function code(response: Response): Promise<string | undefined> {
  return ((await response.json()) as { error?: { code: string } }).error?.code;
}

async function listedNames(market: ReturnType<typeof createMarket>): Promise<string[]> {
  const page = (await (await market.request('/v1/bots')).json()) as { bots: { name: string }[] };
  return page.bots.map((bot) => bot.name);
}

describe('ALTCHA challenge', () => {
  it('issues an uncached HMAC-signed challenge that a real solver can solve', async () => {
    const market = createMarket({ realChallenges: true });
    const response = await market.request('/v1/challenge');

    expect(response.headers.get('cache-control')).toBe('no-store');
    const challenge = parseChallenge(await response.json());
    expect(challenge?.maxnumber).toBe(TIER_MAX_NUMBER.default);
    expect(challenge?.salt).toMatch(/\?expires=\d+$/u);
    expect(await solveChallenge(challenge!)).toEqual(expect.any(String));
  });

  it('is unavailable without a signing key', async () => {
    const market = createMarket({ env: { ALTCHA_HMAC_KEY: '' } });

    const challenge = await market.request('/v1/challenge');
    expect(challenge.status).toBe(503);
    expect(await code(challenge)).toBe('challenge-unavailable');
    const submission = await post(market, '/v1/submissions', { url: 'https://github.com/a/b' });
    expect(await code(submission)).toBe('challenge-unavailable');
  });

  it('rejects a missing, forged, expired or replayed solution', async () => {
    const market = createMarket();
    const repository = fakeRepository();
    market.publish(repository);
    const url = repository.htmlUrl;

    expect(await code(await post(market, '/v1/submissions', { url }))).toBe('challenge-required');

    const forged = await createChallenge({
      key: 'someone-else',
      tier: 'default',
      now: market.clock.value,
      number: 0,
    });
    const forgedPayload = encodeSolution({ ...forged, number: 0 });
    const refused = await post(market, '/v1/submissions', { url, altcha: forgedPayload });
    expect(refused.status).toBe(400);
    expect(await code(refused)).toBe('challenge-invalid');
    expect(await code(await post(market, '/v1/submissions', { url, altcha: 'garbage' }))).toBe(
      'challenge-invalid',
    );

    const stale = await solve(market);
    market.clock.value = new Date(market.clock.value.getTime() + 301_000);
    expect(await code(await post(market, '/v1/submissions', { url, altcha: stale }))).toBe(
      'challenge-expired',
    );

    const once = await solve(market);
    expect((await post(market, '/v1/submissions', { url, altcha: once })).status).toBe(201);
    expect(await code(await post(market, '/v1/submissions', { url, altcha: once }))).toBe(
      'challenge-replayed',
    );
  });

  it('raises the cost tier with recent volume from one source only', async () => {
    const market = createMarket({ limits: { elevatedAfter: 2, highAfter: 4 } });
    const maxNumbers: number[] = [];
    for (let index = 0; index < 5; index += 1) {
      const response = await market.request('/v1/challenge', {
        headers: { 'cf-connecting-ip': '198.51.100.7' },
      });
      maxNumbers.push(((await response.json()) as { maxnumber: number }).maxnumber);
    }
    expect(maxNumbers).toEqual([
      TIER_MAX_NUMBER.default,
      TIER_MAX_NUMBER.default,
      TIER_MAX_NUMBER.elevated,
      TIER_MAX_NUMBER.elevated,
      TIER_MAX_NUMBER.high,
    ]);

    const other = await market.request('/v1/challenge', {
      headers: { 'cf-connecting-ip': '198.51.100.8' },
    });
    expect(((await other.json()) as { maxnumber: number }).maxnumber).toBe(TIER_MAX_NUMBER.default);

    market.clock.value = new Date(market.clock.value.getTime() + 11 * 60_000);
    const later = await market.request('/v1/challenge', {
      headers: { 'cf-connecting-ip': '198.51.100.7' },
    });
    expect(((await later.json()) as { maxnumber: number }).maxnumber).toBe(TIER_MAX_NUMBER.default);
  });

  it('never stores the raw IP address', async () => {
    const market = createMarket();
    const repository = fakeRepository();
    market.publish(repository);
    await submit(market, repository.htmlUrl, '192.0.2.44');

    const tables = market.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as { name: string }[];
    for (const { name } of tables) {
      const rows = JSON.stringify(market.sqlite.prepare(`SELECT * FROM "${name}"`).all());
      expect(rows).not.toContain('192.0.2.44');
    }
  });
});

describe('rate limits', () => {
  it('limits submissions per source with a typed refusal', async () => {
    const market = createMarket({ limits: { submitPerHour: 2 } });
    for (const name of ['one', 'two', 'three']) market.publish(fakeRepository({ name }));

    expect((await submit(market, 'https://github.com/alice/one')).status).toBe(201);
    expect((await submit(market, 'https://github.com/alice/two')).status).toBe(201);
    const limited = await submit(market, 'https://github.com/alice/three');
    expect(limited.status).toBe(429);
    expect(await code(limited)).toBe('rate-limited');
    expect((await submit(market, 'https://github.com/alice/three', '203.0.113.99')).status).toBe(
      201,
    );

    market.clock.value = new Date(market.clock.value.getTime() + 61 * 60_000);
    expect((await submit(market, 'https://github.com/alice/three')).status).toBe(201);
  });

  it('crawls one repository at most once per cooldown', async () => {
    const market = createMarket({ limits: { repositoryCooldownMs: 5 * 60_000 } });
    const repository = fakeRepository();
    market.publish(repository);

    expect((await submit(market, repository.htmlUrl)).status).toBe(201);
    const requests = market.github.requests.length;
    const cooling = await submit(market, 'https://github.com/ALICE/helper-bot', '203.0.113.2');
    expect(cooling.status).toBe(429);
    expect(cooling.headers.get('retry-after')).toBe('300');
    expect(await code(cooling)).toBe('repository-rate-limited');
    expect(market.github.requests.length).toBe(requests);

    market.clock.value = new Date(market.clock.value.getTime() + 5 * 60_000);
    expect((await submit(market, repository.htmlUrl)).status).toBe(201);
  });

  it('limits reports per source', async () => {
    const market = createMarket({ limits: { reportPerHour: 1 } });
    const first = fakeRepository({ name: 'first' });
    const second = fakeRepository({ name: 'second' });
    market.publish(first);
    market.publish(second);
    await submit(market, first.htmlUrl);
    await submit(market, second.htmlUrl);

    expect((await report(market, first.nodeId)).status).toBe(202);
    expect(await code(await report(market, second.nodeId))).toBe('rate-limited');
  });
});

describe('reports', () => {
  it('hides an entry after reports from distinct sources, counting one source once', async () => {
    const market = createMarket({ env: { REPORT_THRESHOLD: '2' } });
    const repository = fakeRepository();
    market.publish(repository);
    await submit(market, repository.htmlUrl);

    expect((await report(market, repository.nodeId, '198.51.100.1', 'Spam')).status).toBe(202);
    expect((await report(market, repository.nodeId, '198.51.100.1')).status).toBe(202);
    expect(await listedNames(market)).toEqual(['helper-bot']);

    expect((await report(market, repository.nodeId, '198.51.100.2')).status).toBe(202);
    expect(await listedNames(market)).toEqual([]);
    expect((await market.request(`/v1/bots/${repository.nodeId}`)).status).toBe(404);

    await market.scheduled('17 * * * *');
    expect(await listedNames(market)).toEqual([]);
    expect(await code(await submit(market, repository.htmlUrl, '198.51.100.3'))).toBe(
      'repository-blocked',
    );
    expect(market.sqlite.prepare('SELECT reason FROM reports ORDER BY created_at').all()).toEqual([
      { reason: 'Spam' },
      { reason: null },
    ]);
  });

  it('refuses a report for an unknown entry or an oversized reason', async () => {
    const market = createMarket();
    expect(await code(await report(market, 'R_missing'))).toBe('bot-not-found');

    const repository = fakeRepository();
    market.publish(repository);
    await submit(market, repository.htmlUrl);
    const long = await report(market, repository.nodeId, undefined, 'x'.repeat(501));
    expect(long.status).toBe(400);
    expect(await code(long)).toBe('invalid-report');
  });
});

describe('admin blocklist', () => {
  it('requires the admin token', async () => {
    const market = createMarket();
    for (const response of [
      await admin(market, { id: 'R_x', action: 'block' }, 'wrong'),
      await market.request('/v1/admin/blocklist', {
        method: 'POST',
        body: '{"id":"R_x","action":"block"}',
      }),
      await admin(createMarket({ env: { ADMIN_TOKEN: '' } }), { id: 'R_x', action: 'block' }, ''),
    ]) {
      expect(response.status).toBe(401);
      expect(await code(response)).toBe('unauthorized');
    }
    expect(await code(await admin(market, { action: 'block' }))).toBe('invalid-admin-request');
    expect(await code(await admin(market, { id: 'R_x', action: 'delete' }))).toBe(
      'invalid-admin-request',
    );
    expect(await code(await admin(market, { id: 'R_x', action: 'block' }))).toBe('bot-not-found');
  });

  it('blocks an entry so neither paste nor discovery lists it, then restores it', async () => {
    const market = createMarket();
    const repository = fakeRepository();
    market.publish(repository);
    await submit(market, repository.htmlUrl);

    const blocked = await admin(market, { id: repository.nodeId, action: 'block' });
    expect(await blocked.json()).toEqual({
      bot: { id: repository.nodeId, fullName: 'alice/helper-bot', visibility: 'blocked' },
    });
    expect(await listedNames(market)).toEqual([]);
    expect(await code(await submit(market, repository.htmlUrl))).toBe('repository-blocked');
    await market.scheduled('0 3 * * *');
    await market.scheduled('17 * * * *');
    expect(await listedNames(market)).toEqual([]);

    const restored = await admin(market, { url: repository.htmlUrl, action: 'restore' });
    expect(await restored.json()).toMatchObject({ bot: { visibility: 'listed' } });
    expect(await listedNames(market)).toEqual(['helper-bot']);
  });

  it('blocks a repository by URL before it was ever indexed', async () => {
    const market = createMarket();
    const repository = fakeRepository();
    market.publish(repository);

    const blocked = await admin(market, { url: repository.htmlUrl, action: 'block' });
    expect(await blocked.json()).toMatchObject({ bot: { visibility: 'blocked' } });
    expect(await code(await submit(market, repository.htmlUrl))).toBe('repository-blocked');
  });

  it('restoring clears reports so a hidden entry lists again', async () => {
    const market = createMarket({ env: { REPORT_THRESHOLD: '1' } });
    const repository = fakeRepository();
    market.publish(repository);
    await submit(market, repository.htmlUrl);
    await report(market, repository.nodeId);
    expect(await listedNames(market)).toEqual([]);

    await admin(market, { id: repository.nodeId, action: 'restore' });
    expect(await listedNames(market)).toEqual(['helper-bot']);
    expect(market.sqlite.prepare('SELECT COUNT(*) AS total FROM reports').get()).toEqual({
      total: 0,
    });
  });
});
