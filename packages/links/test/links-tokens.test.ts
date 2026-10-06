import { describe, expect, it } from 'vitest';
import { BOOTSTRAP, createHarness } from './links-harness.js';

describe('personal access tokens', () => {
  it('shows the plaintext once and stores only a SHA-256 hash', async () => {
    const { createToken, request, sqlite } = createHarness();
    const created = await createToken('write');
    expect(created.token).toMatch(/^bhl_[A-Za-z0-9_-]{43}$/);
    expect(created.prefix).toBe(created.token.slice(0, 12));

    const row = sqlite.prepare('SELECT * FROM tokens').get() as Record<string, unknown>;
    expect(JSON.stringify(row)).not.toContain(created.token);
    const hash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(created.token)),
      ),
      (byte) => byte.toString(16).padStart(2, '0'),
    ).join('');
    expect(row.hash).toBe(hash);

    const listed = (await (await request('/v1/tokens', { token: created.token })).json()) as {
      tokens: Record<string, unknown>[];
    };
    expect(listed.tokens).toHaveLength(1);
    expect(listed.tokens[0]).not.toHaveProperty('token');
    expect(listed.tokens[0]).not.toHaveProperty('hash');
    expect(listed.tokens[0]?.lastUsedAt).toEqual(expect.any(String));
  });

  it('refuses missing, malformed and unknown tokens', async () => {
    const { request } = createHarness();
    for (const token of [undefined, 'nope', `bhl_${'a'.repeat(43)}`]) {
      const response = await request('/v1/campaigns', token === undefined ? {} : { token });
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: { code: 'unauthorized' } });
    }
  });

  it('limits read tokens to reads and keeps them away from token management', async () => {
    const { createToken, request } = createHarness();
    const { token } = await createToken('read');
    expect((await request('/v1/campaigns', { token })).status).toBe(200);
    const write = await request('/v1/campaigns', {
      method: 'POST',
      token,
      body: { slug: 'c1', name: 'C' },
    });
    expect(write.status).toBe(403);
    expect(await write.json()).toEqual({ error: { code: 'insufficient-scope' } });
    expect((await request('/v1/tokens', { token })).status).toBe(403);
  });

  it('accepts the bootstrap secret only for token management', async () => {
    const { request } = createHarness();
    expect((await request('/v1/tokens', { token: BOOTSTRAP })).status).toBe(200);
    const refused = await request('/v1/campaigns', { token: BOOTSTRAP });
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({
      error: { code: 'bootstrap-token-only-manages-tokens' },
    });

    const unset = createHarness({ LINKS_BOOTSTRAP_TOKEN: '' });
    expect((await unset.request('/v1/tokens', { token: 'anything' })).status).toBe(401);
    const short = createHarness({ LINKS_BOOTSTRAP_TOKEN: 'short' });
    expect((await short.request('/v1/tokens', { token: 'short' })).status).toBe(401);
  });

  it('stops accepting revoked and expired tokens', async () => {
    const { createToken, request, sqlite } = createHarness();
    const { id, token } = await createToken('write');
    expect((await request('/v1/campaigns', { token })).status).toBe(200);
    const revoked = await request(`/v1/tokens/${id}/revoke`, { method: 'POST', token: BOOTSTRAP });
    expect(await revoked.json()).toMatchObject({ id, revokedAt: expect.any(String) });
    expect((await request('/v1/campaigns', { token })).status).toBe(401);

    const second = await createToken('read', 1);
    sqlite
      .prepare('UPDATE tokens SET expires_at = ? WHERE id = ?')
      .run(new Date(Date.now() - 1000).toISOString(), second.id);
    expect((await request('/v1/campaigns', { token: second.token })).status).toBe(401);

    const forever = await createToken('read', null);
    const listed = (await (await request('/v1/tokens', { token: BOOTSTRAP })).json()) as {
      tokens: { id: string; expiresAt: string | null }[];
    };
    expect(listed.tokens.find((item) => item.id === forever.id)?.expiresAt).toBeNull();
    expect(
      (await request('/v1/tokens/missing/revoke', { method: 'POST', token: BOOTSTRAP })).status,
    ).toBe(404);
  });
});
