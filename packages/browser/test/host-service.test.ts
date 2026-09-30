import { Context } from '@deepseek-ai/cordis';
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ runtimes: vi.fn() }));
vi.mock('../src/runtimes.js', () => ({ createBotBrowserRuntimes: mocks.runtimes }));

import { apply, DEFAULT_CONFIG } from '../src/index.js';

interface BrowserHostService {
  resetBot?(slug: string): void;
  reconcileBot(slug: string): Promise<void>;
}

interface Route {
  path: string;
  fetch(request: Request): Promise<Response>;
}

const contexts: Context[] = [];
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

async function setup() {
  vi.stubEnv('DSH_HOME', '');
  const ctx = new Context();
  contexts.push(ctx);
  const profiles = new Map([
    ['bot-a', ''],
    ['bot-b', ''],
  ]);
  const routes = new Map<string, Route>();
  const scopes = new Map<string, Map<string, ToolDefinition>>();
  let contribute:
    | ((scope: Context, agent: { id: string }, info: { botSlug: string; rootRole: string }) => void)
    | undefined;
  const opened: { slug: string; profile: string; reuse: string | undefined }[] = [];
  mocks.runtimes.mockReturnValue({
    for: (slug: string) => ({
      open: async (url: string, reuse: string | undefined) => {
        const profile = profiles.get(slug) ?? '';
        opened.push({ slug, profile, reuse });
        return { tabId: `${slug}-${profile || 'default'}`, url, title: 'Work' };
      },
      listTabs: async () =>
        [...profiles].map(([owner, profile]) => ({
          targetId: `${owner}-${profile || 'default'}`,
          url: 'https://example.com',
          title: 'Work',
        })),
      isRunning: () => true,
      captureScreenshot: async () => undefined,
    }),
    touch: () => undefined,
    stopAll: async () => undefined,
  });
  ctx.provide('connection', {
    fetch: {
      register: (route: Route) => {
        routes.set(route.path, route);
        return () => routes.delete(route.path);
      },
    },
  } as never);
  ctx.provide('botharness', {
    registry: {
      get: (slug: string) => ({ browserAccess: true, browserProfile: profiles.get(slug) }),
      list: () => [...profiles.keys()].map((slug) => ({ slug, browserAccess: true })),
    },
    ownership: {
      resolve: (sessionId: string) => ({ botSlug: sessionId, rootRole: 'orchestrator' }),
    },
    contributeBotAgentSetup: (callback: typeof contribute) => {
      contribute = callback;
      return () => undefined;
    },
  } as never);
  apply(ctx, { ...DEFAULT_CONFIG, autoAllowActions: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (const slug of profiles.keys()) {
    const definitions = new Map<string, ToolDefinition>();
    const scope = {
      tools: {
        register: (definition: ToolDefinition) => {
          definitions.set(definition.name, definition);
          return () => definitions.delete(definition.name);
        },
      },
      systemPrompt: { section: () => () => undefined, getSectionOrder: () => 3000 },
    } as unknown as Context;
    scopes.set(slug, definitions);
    contribute?.(scope, { id: slug }, { botSlug: slug, rootRole: 'orchestrator' });
  }
  const service = ctx.get('botharnessBrowserTools') as unknown as BrowserHostService;
  async function open(slug: string) {
    await scopes
      .get(slug)!
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, {
        agent: { id: slug },
        signal: new AbortController().signal,
      } as ToolRunContext);
  }
  async function observation(slug: string): Promise<{ focused: string | null; takeover: boolean }> {
    return (
      await routes
        .get('/api/browser/observation')!
        .fetch(new Request(`http://localhost/api/browser/observation?slug=${slug}`))
    ).json();
  }
  return { service, profiles, routes, opened, open, observation };
}

describe('published Browser Host service', () => {
  it('resets the switching Bot through the service used by core without resetting another Bot', async () => {
    const h = await setup();
    await h.open('bot-a');
    await h.open('bot-b');
    await h.routes.get('/api/browser/takeover')!.fetch(
      new Request('http://localhost/api/browser/takeover', {
        method: 'POST',
        body: JSON.stringify({ slug: 'bot-a', active: true }),
      }),
    );
    h.profiles.set('bot-a', 'work');
    h.service.resetBot?.('bot-a');
    expect(await h.observation('bot-a')).toMatchObject({ focused: null, takeover: false });
    expect(await h.observation('bot-b')).toMatchObject({ focused: 'bot-b-default' });
    await h.open('bot-a');
    expect(h.opened.at(-1)).toEqual({ slug: 'bot-a', profile: 'work', reuse: undefined });
    expect(await h.observation('bot-a')).toMatchObject({ focused: 'bot-a-work' });
  });
});
