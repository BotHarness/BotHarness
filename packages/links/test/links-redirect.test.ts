import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHarness } from './links-harness.js';

const captured: Request[] = [];
afterEach(() => {
  captured.length = 0;
  vi.unstubAllGlobals();
});
const stubPostHog = (respond: () => Promise<Response> = async () => new Response('{"status":1}')) =>
  vi.stubGlobal('fetch', async (input: URL, init: RequestInit) => {
    captured.push(new Request(input, init));
    return respond();
  });

async function seeded(overrides: Parameters<typeof createHarness>[0] = {}) {
  const harness = createHarness(overrides);
  const { token } = await harness.createToken('write');
  await harness.request('/v1/campaigns', {
    method: 'POST',
    token,
    body: { slug: 'ph-launch', name: 'Product Hunt launch' },
  });
  await harness.request('/v1/links', {
    method: 'POST',
    token,
    body: {
      slug: 'ph-x-post',
      campaign: 'ph-launch',
      platform: 'x',
      media: 'post',
      path: '/docs/overview/',
      language: 'en',
    },
  });
  await harness.request('/v1/links', {
    method: 'POST',
    token,
    body: { slug: 'bili-video', campaign: 'ph-launch', platform: 'bilibili', media: 'video' },
  });
  return { ...harness, token };
}

describe('campaign link redirect', () => {
  it('redirects with the campaign UTMs, counts the click and sends link_clicked without a person', async () => {
    stubPostHog();
    const { request, token } = await seeded();

    const response = await request('/ph-x-post');
    expect(response.status).toBe(302);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('location')).toBe(
      'https://deepseekbot.botharness.ai/en/docs/overview/?utm_campaign=ph-launch&utm_source=x&utm_medium=post&utm_content=ph-x-post',
    );

    const [event] = captured;
    expect(event?.url).toBe('https://us.i.posthog.com/i/v0/e/');
    const body = (await event?.json()) as Record<string, unknown> & {
      properties: Record<string, unknown>;
    };
    expect(body.api_key).toBe('phc_test');
    expect(body.event).toBe('link_clicked');
    expect(body.distinct_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.properties).toEqual({
      source: 'links',
      campaign: 'ph-launch',
      link: 'ph-x-post',
      platform: 'x',
      media: 'post',
      language: 'en',
      $process_person_profile: false,
      $geoip_disable: true,
    });

    await request('/ph-x-post');
    const second = captured[1] ? ((await captured[1].json()) as { distinct_id: string }) : null;
    expect(second?.distinct_id).not.toBe(body.distinct_id);

    const clicks = (await (await request('/v1/links/ph-x-post/clicks', { token })).json()) as {
      total: number;
      daily: { day: string; clicks: number }[];
    };
    expect(clicks.total).toBe(2);
    expect(clicks.daily).toEqual([{ day: new Date().toISOString().slice(0, 10), clicks: 2 }]);
  });

  it('opens a zh link at the path as is', async () => {
    stubPostHog();
    const { request } = await seeded();
    expect((await request('/bili-video')).headers.get('location')).toBe(
      'https://deepseekbot.botharness.ai/?utm_campaign=ph-launch&utm_source=bilibili&utm_medium=video&utm_content=bili-video',
    );
  });

  it('still redirects and counts when PostHog fails or is not configured', async () => {
    stubPostHog(async () => {
      throw new Error('network down');
    });
    const { request, token } = await seeded();
    expect((await request('/bili-video')).status).toBe(302);

    const unconfigured = await seeded({ POSTHOG_KEY: '' });
    captured.length = 0;
    expect((await unconfigured.request('/bili-video')).status).toBe(302);
    expect(captured).toHaveLength(0);

    const clicks = (await (await request('/v1/links/bili-video/clicks', { token })).json()) as {
      total: number;
    };
    expect(clicks.total).toBe(1);
  });

  it('sends unknown, archived and reserved slugs to the site root without UTMs or counting', async () => {
    stubPostHog();
    const { request, token, sqlite } = await seeded();
    for (const path of ['/nope', '/admin', '/Not_Valid']) {
      const response = await request(path);
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('https://deepseekbot.botharness.ai/');
    }
    await request('/v1/links/ph-x-post/archive', { method: 'POST', token });
    expect((await request('/ph-x-post')).headers.get('location')).toBe(
      'https://deepseekbot.botharness.ai/',
    );
    await request('/v1/campaigns/ph-launch/archive', { method: 'POST', token });
    expect((await request('/bili-video')).headers.get('location')).toBe(
      'https://deepseekbot.botharness.ai/',
    );
    expect(captured).toHaveLength(0);
    expect(sqlite.prepare('SELECT SUM(clicks) AS total FROM links').get()).toEqual({ total: 0 });
  });

  it('does not count HEAD requests', async () => {
    stubPostHog();
    const { request, sqlite } = await seeded();
    const response = await request('/bili-video', { method: 'HEAD' });
    expect(response.status).toBe(302);
    expect(captured).toHaveLength(0);
    expect(sqlite.prepare('SELECT SUM(clicks) AS total FROM links').get()).toEqual({ total: 0 });
  });

  it('redirects the bare domain to the product site', async () => {
    const { request } = createHarness();
    const response = await request('/');
    expect(response.headers.get('location')).toBe('https://deepseekbot.botharness.ai/');
  });
});
