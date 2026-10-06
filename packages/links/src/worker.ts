import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { bearerAuth } from 'hono/bearer-auth';
import { HTTPException } from 'hono/http-exception';
import type { D1Database } from './d1.js';
import { SHORT_ORIGIN, sendLinkClicked, siteRoot, targetUrl } from './redirect.js';
import {
  CampaignClicksSchema,
  CampaignCreateSchema,
  CampaignSchema,
  CampaignUpdateSchema,
  CreatedTokenSchema,
  ErrorSchema,
  LinkClicksSchema,
  LinkCreateSchema,
  LinkSchema,
  LinkUpdateSchema,
  RESERVED_SLUGS,
  TokenCreateSchema,
  TokenSchema,
  type Link,
  type Scope,
} from './schemas.js';
import { createStore, isUniqueViolation, type LinkRecord, type Store } from './store.js';
import {
  displayPrefix,
  generateToken,
  hashToken,
  MIN_BOOTSTRAP_LENGTH,
  sameSecret,
  TOKEN_PATTERN,
} from './tokens.js';

export interface LinksEnv {
  LINKS_DB: D1Database;
  LINKS_BOOTSTRAP_TOKEN?: string;
  POSTHOG_HOST?: string;
  POSTHOG_KEY?: string;
}

export type Principal = { kind: 'bootstrap' } | { kind: 'token'; id: string; scope: Scope };

type AppEnv = { Bindings: LinksEnv; Variables: { principal: Principal; store: Store } };

const DAY_MS = 86_400_000;
const TOUCH_INTERVAL_MS = 3_600_000;

const security = [{ bearerAuth: [] }];
const json = <T extends z.ZodType>(schema: T, description: string) => ({
  content: { 'application/json': { schema } },
  description,
});
const errorResponse = (description: string) => json(ErrorSchema, description);
const authErrors = {
  401: errorResponse('Missing, unknown, expired or revoked token'),
  403: errorResponse('The token scope does not allow this operation'),
};
const SlugParam = z.object({
  slug: z.string().openapi({ param: { name: 'slug', in: 'path' }, example: 'ph-launch' }),
});
const IncludeArchived = z
  .enum(['true', 'false'])
  .optional()
  .openapi({ description: 'true also lists archived entries' });

const error = (code: string) => ({ error: { code } });
const now = () => new Date().toISOString();

export const app = new OpenAPIHono<AppEnv>({
  defaultHook: (result, c) => {
    if (result.success) return;
    return c.json(
      {
        error: {
          code: 'invalid-request',
          issues: result.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      },
      400,
    );
  },
});

app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  description: 'A Personal Access Token (bhl_…); GET needs read or write scope, changes need write',
});

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  console.error(JSON.stringify({ module: 'links-worker', phase: 'error', error: String(err) }));
  return c.json(error('internal-error'), 500);
});

app.use('*', async (c, next) => {
  c.set('store', createStore(c.env.LINKS_DB));
  await next();
});

app.use(
  '/v1/*',
  bearerAuth<AppEnv>({
    noAuthenticationHeader: { message: error('unauthorized') },
    invalidAuthenticationHeader: { message: error('unauthorized') },
    invalidToken: { message: error('unauthorized') },
    verifyToken: async (token, c) => {
      const bootstrap = c.env.LINKS_BOOTSTRAP_TOKEN;
      if (
        bootstrap !== undefined &&
        bootstrap.length >= MIN_BOOTSTRAP_LENGTH &&
        (await sameSecret(token, bootstrap))
      ) {
        c.set('principal', { kind: 'bootstrap' });
        return true;
      }
      if (!TOKEN_PATTERN.test(token)) return false;
      const at = new Date();
      const found = await c.var.store.activeToken(await hashToken(token), at.toISOString());
      if (!found) return false;
      c.set('principal', { kind: 'token', id: found.id, scope: found.scope });
      c.executionCtx.waitUntil(
        c.var.store.touchToken(
          found.id,
          at.toISOString(),
          new Date(at.getTime() - TOUCH_INTERVAL_MS).toISOString(),
        ),
      );
      return true;
    },
  }),
);

app.use('/v1/*', async (c, next) => {
  const principal = c.var.principal;
  const tokenRoute = c.req.path === '/v1/tokens' || c.req.path.startsWith('/v1/tokens/');
  const reading = c.req.method === 'GET' || c.req.method === 'HEAD';
  if (principal.kind === 'bootstrap') {
    if (!tokenRoute) return c.json(error('bootstrap-token-only-manages-tokens'), 403);
  } else if ((tokenRoute || !reading) && principal.scope !== 'write') {
    return c.json(error('insufficient-scope'), 403);
  }
  await next();
});

function present(link: LinkRecord): Link {
  return {
    id: link.id,
    slug: link.slug,
    campaign: link.campaign,
    platform: link.platform,
    media: link.media,
    path: link.path,
    language: link.language,
    note: link.note,
    shortUrl: `${SHORT_ORIGIN}/${link.slug}`,
    target: targetUrl(link),
    clicks: link.clicks,
    lastClickedAt: link.lastClickedAt,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
    archivedAt: link.archivedAt,
  };
}

app.openapi(
  createRoute({
    method: 'post',
    path: '/v1/tokens',
    tags: ['Tokens'],
    summary: 'Create a Personal Access Token; the plaintext is returned only here',
    security,
    request: { body: { content: { 'application/json': { schema: TokenCreateSchema } } } },
    responses: {
      201: json(CreatedTokenSchema, 'The new token with its plaintext value'),
      400: errorResponse('Invalid request'),
      ...authErrors,
    },
  }),
  async (c) => {
    const body = c.req.valid('json');
    const token = generateToken();
    const at = new Date();
    const created = await c.var.store.createToken(
      {
        name: body.name,
        prefix: displayPrefix(token),
        hash: await hashToken(token),
        scope: body.scope,
        expiresAt:
          body.expiresInDays === null
            ? null
            : new Date(at.getTime() + body.expiresInDays * DAY_MS).toISOString(),
      },
      at.toISOString(),
    );
    return c.json({ ...created, token }, 201);
  },
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/v1/tokens',
    tags: ['Tokens'],
    summary: 'List tokens without their secrets',
    security,
    responses: { 200: json(z.object({ tokens: z.array(TokenSchema) }), 'Tokens'), ...authErrors },
  }),
  async (c) => c.json({ tokens: await c.var.store.tokens() }, 200),
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/v1/tokens/{id}/revoke',
    tags: ['Tokens'],
    summary: 'Revoke a token',
    security,
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: json(TokenSchema, 'The revoked token'),
      404: errorResponse('token-not-found'),
      ...authErrors,
    },
  }),
  async (c) => {
    const revoked = await c.var.store.revokeToken(c.req.valid('param').id, now());
    return revoked ? c.json(revoked, 200) : c.json(error('token-not-found'), 404);
  },
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/v1/campaigns',
    tags: ['Campaigns'],
    summary: 'Create a Campaign',
    security,
    request: { body: { content: { 'application/json': { schema: CampaignCreateSchema } } } },
    responses: {
      201: json(CampaignSchema, 'The new Campaign'),
      400: errorResponse('Invalid request'),
      409: errorResponse('campaign-slug-taken'),
      ...authErrors,
    },
  }),
  async (c) => {
    const body = c.req.valid('json');
    try {
      const created = await c.var.store.createCampaign(
        body.slug,
        body.name,
        body.description ?? null,
        now(),
      );
      return c.json(created, 201);
    } catch (err) {
      if (isUniqueViolation(err)) return c.json(error('campaign-slug-taken'), 409);
      throw err;
    }
  },
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/v1/campaigns',
    tags: ['Campaigns'],
    summary: 'List Campaigns, newest first',
    security,
    request: { query: z.object({ includeArchived: IncludeArchived }) },
    responses: {
      200: json(z.object({ campaigns: z.array(CampaignSchema) }), 'Campaigns'),
      ...authErrors,
    },
  }),
  async (c) => {
    const includeArchived = c.req.valid('query').includeArchived === 'true';
    return c.json({ campaigns: await c.var.store.campaigns(includeArchived) }, 200);
  },
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/v1/campaigns/{slug}',
    tags: ['Campaigns'],
    summary: 'Read a Campaign',
    security,
    request: { params: SlugParam },
    responses: {
      200: json(CampaignSchema, 'The Campaign'),
      404: errorResponse('campaign-not-found'),
      ...authErrors,
    },
  }),
  async (c) => {
    const found = await c.var.store.campaign(c.req.valid('param').slug);
    return found ? c.json(found, 200) : c.json(error('campaign-not-found'), 404);
  },
);

app.openapi(
  createRoute({
    method: 'patch',
    path: '/v1/campaigns/{slug}',
    tags: ['Campaigns'],
    summary: 'Update a Campaign name or description; the slug is fixed',
    security,
    request: {
      params: SlugParam,
      body: { content: { 'application/json': { schema: CampaignUpdateSchema } } },
    },
    responses: {
      200: json(CampaignSchema, 'The updated Campaign'),
      400: errorResponse('Invalid request'),
      404: errorResponse('campaign-not-found'),
      ...authErrors,
    },
  }),
  async (c) => {
    const updated = await c.var.store.updateCampaign(
      c.req.valid('param').slug,
      c.req.valid('json'),
      now(),
    );
    return updated ? c.json(updated, 200) : c.json(error('campaign-not-found'), 404);
  },
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/v1/campaigns/{slug}/archive',
    tags: ['Campaigns'],
    summary: 'Archive a Campaign; its links stop redirecting with UTMs',
    security,
    request: { params: SlugParam },
    responses: {
      200: json(CampaignSchema, 'The archived Campaign'),
      404: errorResponse('campaign-not-found'),
      ...authErrors,
    },
  }),
  async (c) => {
    const archived = await c.var.store.archiveCampaign(c.req.valid('param').slug, now());
    return archived ? c.json(archived, 200) : c.json(error('campaign-not-found'), 404);
  },
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/v1/campaigns/{slug}/clicks',
    tags: ['Campaigns'],
    summary: 'Click totals of a Campaign and each of its links',
    security,
    request: { params: SlugParam },
    responses: {
      200: json(CampaignClicksSchema, 'Click totals'),
      404: errorResponse('campaign-not-found'),
      ...authErrors,
    },
  }),
  async (c) => {
    const slug = c.req.valid('param').slug;
    if (!(await c.var.store.campaign(slug))) return c.json(error('campaign-not-found'), 404);
    const links = await c.var.store.links(slug, true);
    return c.json(
      {
        campaign: slug,
        total: links.reduce((sum, link) => sum + link.clicks, 0),
        links: links.map((link) => ({
          slug: link.slug,
          platform: link.platform,
          media: link.media,
          clicks: link.clicks,
          lastClickedAt: link.lastClickedAt,
          archivedAt: link.archivedAt,
        })),
      },
      200,
    );
  },
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/v1/links',
    tags: ['Links'],
    summary: 'Create a Campaign Link',
    security,
    request: { body: { content: { 'application/json': { schema: LinkCreateSchema } } } },
    responses: {
      201: json(LinkSchema, 'The new Campaign Link'),
      400: errorResponse('Invalid request'),
      404: errorResponse('campaign-not-found'),
      409: errorResponse('link-slug-taken or campaign-archived'),
      ...authErrors,
    },
  }),
  async (c) => {
    const body = c.req.valid('json');
    const campaign = await c.var.store.campaign(body.campaign);
    if (!campaign) return c.json(error('campaign-not-found'), 404);
    if (campaign.archivedAt) return c.json(error('campaign-archived'), 409);
    try {
      await c.var.store.createLink(
        {
          slug: body.slug,
          campaignId: campaign.id,
          platform: body.platform,
          media: body.media,
          path: body.path,
          language: body.language,
          note: body.note ?? null,
        },
        now(),
      );
    } catch (err) {
      if (isUniqueViolation(err)) return c.json(error('link-slug-taken'), 409);
      throw err;
    }
    const created = await c.var.store.link(body.slug);
    if (!created) throw new Error('created link not found');
    return c.json(present(created), 201);
  },
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/v1/links',
    tags: ['Links'],
    summary: 'List Campaign Links, newest first',
    security,
    request: {
      query: z.object({
        campaign: z.string().optional().openapi({ description: 'Only links of this Campaign' }),
        includeArchived: IncludeArchived,
      }),
    },
    responses: { 200: json(z.object({ links: z.array(LinkSchema) }), 'Links'), ...authErrors },
  }),
  async (c) => {
    const query = c.req.valid('query');
    const links = await c.var.store.links(query.campaign, query.includeArchived === 'true');
    return c.json({ links: links.map((link) => present(link)) }, 200);
  },
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/v1/links/{slug}',
    tags: ['Links'],
    summary: 'Read a Campaign Link',
    security,
    request: { params: SlugParam },
    responses: {
      200: json(LinkSchema, 'The Campaign Link'),
      404: errorResponse('link-not-found'),
      ...authErrors,
    },
  }),
  async (c) => {
    const found = await c.var.store.link(c.req.valid('param').slug);
    return found ? c.json(present(found), 200) : c.json(error('link-not-found'), 404);
  },
);

app.openapi(
  createRoute({
    method: 'patch',
    path: '/v1/links/{slug}',
    tags: ['Links'],
    summary: 'Update a Campaign Link; its slug and Campaign are fixed',
    security,
    request: {
      params: SlugParam,
      body: { content: { 'application/json': { schema: LinkUpdateSchema } } },
    },
    responses: {
      200: json(LinkSchema, 'The updated Campaign Link'),
      400: errorResponse('Invalid request'),
      404: errorResponse('link-not-found'),
      ...authErrors,
    },
  }),
  async (c) => {
    const slug = c.req.valid('param').slug;
    if (!(await c.var.store.updateLink(slug, c.req.valid('json'), now()))) {
      return c.json(error('link-not-found'), 404);
    }
    const updated = await c.var.store.link(slug);
    return updated ? c.json(present(updated), 200) : c.json(error('link-not-found'), 404);
  },
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/v1/links/{slug}/archive',
    tags: ['Links'],
    summary: 'Archive a Campaign Link; it then redirects to the site root without UTMs',
    security,
    request: { params: SlugParam },
    responses: {
      200: json(LinkSchema, 'The archived Campaign Link'),
      404: errorResponse('link-not-found'),
      ...authErrors,
    },
  }),
  async (c) => {
    const slug = c.req.valid('param').slug;
    if (!(await c.var.store.archiveLink(slug, now()))) return c.json(error('link-not-found'), 404);
    const archived = await c.var.store.link(slug);
    return archived ? c.json(present(archived), 200) : c.json(error('link-not-found'), 404);
  },
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/v1/links/{slug}/clicks',
    tags: ['Links'],
    summary: 'Click total and daily (UTC) counts of a Campaign Link',
    security,
    request: {
      params: SlugParam,
      query: z.object({
        days: z.coerce.number().int().min(1).max(366).default(30).openapi({ example: 30 }),
      }),
    },
    responses: {
      200: json(LinkClicksSchema, 'Click counts'),
      400: errorResponse('Invalid request'),
      404: errorResponse('link-not-found'),
      ...authErrors,
    },
  }),
  async (c) => {
    const found = await c.var.store.link(c.req.valid('param').slug);
    if (!found) return c.json(error('link-not-found'), 404);
    const since = new Date(Date.now() - (c.req.valid('query').days - 1) * DAY_MS)
      .toISOString()
      .slice(0, 10);
    return c.json(
      {
        link: found.slug,
        total: found.clicks,
        lastClickedAt: found.lastClickedAt,
        daily: await c.var.store.dailyClicks(found.id, since),
      },
      200,
    );
  },
);

app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    title: 'BotHarness Campaign Links',
    version: '1.0.0',
    description:
      'Campaign short links on go.botharness.ai (ADR-0132). GET /{slug} redirects to deepseekbot.botharness.ai with UTM parameters.',
  },
  servers: [{ url: 'https://go.botharness.ai' }],
});

app.get('/', (c) => c.redirect(siteRoot(), 302));

app.openapi(
  createRoute({
    method: 'get',
    path: '/{slug}',
    tags: ['Redirect'],
    summary:
      'Redirect to the product site with utm_campaign, utm_source, utm_medium and utm_content; unknown or archived slugs go to the site root without UTMs',
    request: { params: SlugParam },
    responses: { 302: { description: 'Redirect to deepseekbot.botharness.ai' } },
  }),
  async (c) => {
    const slug = c.req.valid('param').slug;
    c.header('cache-control', 'no-store');
    const found = RESERVED_SLUGS.has(slug) ? null : await c.var.store.link(slug.toLowerCase());
    if (!found || found.archivedAt || found.campaignArchivedAt) {
      return c.redirect(siteRoot(), 302);
    }
    if (c.req.method === 'GET') {
      const at = now();
      c.executionCtx.waitUntil(
        Promise.all([
          c.var.store.recordClick(found.id, at).catch((err: unknown) => {
            console.error(
              JSON.stringify({ module: 'links-worker', phase: 'count', error: String(err) }),
            );
          }),
          sendLinkClicked({ host: c.env.POSTHOG_HOST, key: c.env.POSTHOG_KEY }, found, at),
        ]),
      );
    }
    return c.redirect(targetUrl(found), 302);
  },
);

export default app;
