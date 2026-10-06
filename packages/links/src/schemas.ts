import { z } from '@hono/zod-openapi';

export const RESERVED_SLUGS = new Set(['v1', 'v2', 'mcp', 'admin', 'api', 'health', 'openapi']);

export const SlugSchema = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/, 'lowercase letters, digits and hyphens, 1-64')
  .refine((slug) => !RESERVED_SLUGS.has(slug), 'reserved slug')
  .openapi({ example: 'ph-launch' });

export const LabelSchema = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9_-]{0,30}[a-z0-9])?$/, 'lowercase letters, digits, - and _, 1-32');

export const PathSchema = z
  .string()
  .max(512)
  .regex(/^\/(?!\/)[A-Za-z0-9\-._~/%]*$/, 'a path on the product site, starting with /')
  .refine((path) => !/^\/en(?:\/|$)/.test(path), 'give the path without /en; set language: en')
  .refine((path) => !path.split('/').includes('..'), 'no .. segments')
  .openapi({ example: '/docs/overview/' });

export const LanguageSchema = z.enum(['zh', 'en']).openapi({
  description: 'zh opens the path as is, en opens it under /en',
});

export const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    }),
  })
  .openapi('Error');

export const CampaignSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    archivedAt: z.string().nullable(),
  })
  .openapi('Campaign');

export const CampaignCreateSchema = z
  .object({
    slug: SlugSchema,
    name: z.string().trim().min(1).max(120),
    description: z.string().max(500).optional(),
  })
  .openapi('CampaignCreate');

export const CampaignUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().max(500).nullable().optional(),
  })
  .openapi('CampaignUpdate');

export const LinkSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    campaign: z.string(),
    platform: z.string(),
    media: z.string(),
    path: z.string(),
    language: LanguageSchema,
    note: z.string().nullable(),
    shortUrl: z.string(),
    target: z.string(),
    clicks: z.number().int(),
    lastClickedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    archivedAt: z.string().nullable(),
  })
  .openapi('Link');

export const LinkCreateSchema = z
  .object({
    slug: SlugSchema.optional().openapi({
      description: 'omit to generate <platform>-<media>, numbered -2, -3… when taken',
    }),
    campaign: SlugSchema,
    platform: LabelSchema.openapi({ example: 'producthunt' }),
    media: LabelSchema.openapi({ example: 'launch' }),
    path: PathSchema.default('/'),
    language: LanguageSchema.default('zh'),
    note: z.string().max(500).optional(),
  })
  .openapi('LinkCreate');

export const LinkUpdateSchema = z
  .object({
    platform: LabelSchema.optional(),
    media: LabelSchema.optional(),
    path: PathSchema.optional(),
    language: LanguageSchema.optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .openapi('LinkUpdate');

export const LinkClicksSchema = z
  .object({
    link: z.string(),
    total: z.number().int(),
    lastClickedAt: z.string().nullable(),
    daily: z.array(z.object({ day: z.string(), clicks: z.number().int() })),
  })
  .openapi('LinkClicks');

export const CampaignClicksSchema = z
  .object({
    campaign: z.string(),
    total: z.number().int(),
    links: z.array(
      z.object({
        slug: z.string(),
        platform: z.string(),
        media: z.string(),
        clicks: z.number().int(),
        lastClickedAt: z.string().nullable(),
        archivedAt: z.string().nullable(),
      }),
    ),
  })
  .openapi('CampaignClicks');

export const ScopeSchema = z.enum(['read', 'write']);

export const TokenSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    prefix: z.string(),
    scope: ScopeSchema,
    createdAt: z.string(),
    expiresAt: z.string().nullable(),
    revokedAt: z.string().nullable(),
    lastUsedAt: z.string().nullable(),
  })
  .openapi('Token');

export const TokenCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    scope: ScopeSchema,
    expiresInDays: z.number().int().min(1).max(3650).nullable().default(90).openapi({
      description: 'Days until the token stops working; null never expires',
    }),
  })
  .openapi('TokenCreate');

export const CreatedTokenSchema = TokenSchema.extend({
  token: z.string().openapi({ description: 'The plaintext token, shown only in this response' }),
}).openapi('CreatedToken');

export type Campaign = z.infer<typeof CampaignSchema>;
export type Link = z.infer<typeof LinkSchema>;
export type Token = z.infer<typeof TokenSchema>;
export type Scope = z.infer<typeof ScopeSchema>;
export type Language = z.infer<typeof LanguageSchema>;
export type CampaignCreate = z.input<typeof CampaignCreateSchema>;
export type CampaignUpdate = z.input<typeof CampaignUpdateSchema>;
export type LinkCreate = z.input<typeof LinkCreateSchema>;
export type LinkUpdate = z.input<typeof LinkUpdateSchema>;
export type LinkClicks = z.infer<typeof LinkClicksSchema>;
export type CampaignClicks = z.infer<typeof CampaignClicksSchema>;
