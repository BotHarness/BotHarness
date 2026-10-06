import { SHORT_ORIGIN, targetUrl } from './redirect.js';
import type { Campaign, Language, Link, Scope, Token } from './schemas.js';
import { isUniqueViolation, type LinkChanges, type LinkRecord, type Store } from './store.js';
import { displayPrefix, generateToken, hashToken } from './tokens.js';

export const DAY_MS = 86_400_000;

export type Failure<S extends number> = { ok: false; code: string; status: S };
export type Result<T, S extends number> = { ok: true; value: T } | Failure<S>;

const fail = <S extends number>(code: string, status: S): Failure<S> => ({
  ok: false,
  code,
  status,
});
const now = () => new Date().toISOString();

export function presentLink(link: LinkRecord): Link {
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

export async function createCampaign(
  store: Store,
  input: { slug: string; name: string; description?: string | undefined },
): Promise<Result<Campaign, 409>> {
  try {
    return {
      ok: true,
      value: await store.createCampaign(input.slug, input.name, input.description ?? null, now()),
    };
  } catch (err) {
    if (isUniqueViolation(err)) return fail('campaign-slug-taken', 409);
    throw err;
  }
}

export async function updateCampaign(
  store: Store,
  slug: string,
  changes: { name?: string | undefined; description?: string | null | undefined },
): Promise<Result<Campaign, 404>> {
  const updated = await store.updateCampaign(slug, changes, now());
  return updated ? { ok: true, value: updated } : fail('campaign-not-found', 404);
}

export async function archiveCampaign(store: Store, slug: string): Promise<Result<Campaign, 404>> {
  const archived = await store.archiveCampaign(slug, now());
  return archived ? { ok: true, value: archived } : fail('campaign-not-found', 404);
}

export async function createLink(
  store: Store,
  input: {
    slug?: string | undefined;
    campaign: string;
    platform: string;
    media: string;
    path: string;
    language: Language;
    note?: string | undefined;
  },
): Promise<Result<Link, 404 | 409>> {
  const campaign = await store.campaign(input.campaign);
  if (!campaign) return fail('campaign-not-found', 404);
  if (campaign.archivedAt) return fail('campaign-archived', 409);
  const candidates = input.slug ? [input.slug] : generatedSlugs(input.platform, input.media);
  for (const slug of candidates) {
    try {
      await store.createLink(
        {
          slug,
          campaignId: campaign.id,
          platform: input.platform,
          media: input.media,
          path: input.path,
          language: input.language,
          note: input.note ?? null,
        },
        now(),
      );
    } catch (err) {
      if (isUniqueViolation(err)) continue;
      throw err;
    }
    return readLink(store, slug);
  }
  return fail('link-slug-taken', 409);
}

const GENERATED_ATTEMPTS = 100;

function generatedSlugs(platform: string, media: string): string[] {
  const base = `${platform}-${media}`
    .replaceAll('_', '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 58)
    .replace(/-$/, '');
  const slugs = [base];
  for (let n = 2; n <= GENERATED_ATTEMPTS; n += 1) slugs.push(`${base}-${n}`);
  return slugs;
}

export async function readLink(store: Store, slug: string): Promise<Result<Link, 404>> {
  const found = await store.link(slug);
  return found ? { ok: true, value: presentLink(found) } : fail('link-not-found', 404);
}

export async function updateLink(
  store: Store,
  slug: string,
  changes: LinkChanges,
): Promise<Result<Link, 404>> {
  if (!(await store.updateLink(slug, changes, now()))) return fail('link-not-found', 404);
  return readLink(store, slug);
}

export async function archiveLink(store: Store, slug: string): Promise<Result<Link, 404>> {
  if (!(await store.archiveLink(slug, now()))) return fail('link-not-found', 404);
  return readLink(store, slug);
}

export interface LinkClicks {
  link: string;
  total: number;
  lastClickedAt: string | null;
  daily: { day: string; clicks: number }[];
}

export function sinceDay(days: number): string {
  return new Date(Date.now() - (days - 1) * DAY_MS).toISOString().slice(0, 10);
}

export async function linkClicks(
  store: Store,
  slug: string,
  days: number,
): Promise<Result<LinkClicks, 404>> {
  const found = await store.link(slug);
  if (!found) return fail('link-not-found', 404);
  return {
    ok: true,
    value: {
      link: found.slug,
      total: found.clicks,
      lastClickedAt: found.lastClickedAt,
      daily: await store.dailyClicks(found.id, sinceDay(days)),
    },
  };
}

export interface CampaignClicks {
  campaign: string;
  total: number;
  links: {
    slug: string;
    platform: string;
    media: string;
    clicks: number;
    lastClickedAt: string | null;
    archivedAt: string | null;
  }[];
}

export async function campaignClicks(
  store: Store,
  slug: string,
): Promise<Result<CampaignClicks, 404>> {
  if (!(await store.campaign(slug))) return fail('campaign-not-found', 404);
  const links = await store.links(slug, true);
  return {
    ok: true,
    value: {
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
  };
}

export async function createToken(
  store: Store,
  input: { name: string; scope: Scope; expiresInDays: number | null },
): Promise<Token & { token: string }> {
  const token = generateToken();
  const at = new Date();
  const created = await store.createToken(
    {
      name: input.name,
      prefix: displayPrefix(token),
      hash: await hashToken(token),
      scope: input.scope,
      expiresAt:
        input.expiresInDays === null
          ? null
          : new Date(at.getTime() + input.expiresInDays * DAY_MS).toISOString(),
    },
    at.toISOString(),
  );
  return { ...created, token };
}

export async function revokeToken(store: Store, id: string): Promise<Result<Token, 404>> {
  const revoked = await store.revokeToken(id, now());
  return revoked ? { ok: true, value: revoked } : fail('token-not-found', 404);
}
