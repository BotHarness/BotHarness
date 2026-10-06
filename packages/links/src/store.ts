import type { D1Database } from './d1.js';
import type { Campaign, Language, Scope, Token } from './schemas.js';

interface CampaignRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface LinkRecord {
  id: string;
  slug: string;
  campaign: string;
  campaignArchivedAt: string | null;
  platform: string;
  media: string;
  path: string;
  language: Language;
  note: string | null;
  clicks: number;
  lastClickedAt: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

interface LinkRow {
  id: string;
  slug: string;
  campaign: string;
  campaign_archived_at: string | null;
  platform: string;
  media: string;
  path: string;
  language: Language;
  note: string | null;
  clicks: number;
  last_clicked_at: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

interface TokenRow {
  id: string;
  name: string;
  prefix: string;
  scope: Scope;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
}

export interface NewLink {
  slug: string;
  campaignId: string;
  platform: string;
  media: string;
  path: string;
  language: Language;
  note: string | null;
}

export interface LinkChanges {
  platform?: string | undefined;
  media?: string | undefined;
  path?: string | undefined;
  language?: Language | undefined;
  note?: string | null | undefined;
}

const LINK_SELECT = `SELECT l.id, l.slug, c.slug AS campaign, c.archived_at AS campaign_archived_at,
  l.platform, l.media, l.path, l.language, l.note, l.clicks, l.last_clicked_at,
  l.created_at, l.updated_at, l.archived_at
  FROM links l JOIN campaigns c ON c.id = l.campaign_id`;

const TOKEN_COLUMNS = 'id, name, prefix, scope, created_at, expires_at, revoked_at, last_used_at';

function toCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

function toLink(row: LinkRow): LinkRecord {
  return {
    id: row.id,
    slug: row.slug,
    campaign: row.campaign,
    campaignArchivedAt: row.campaign_archived_at,
    platform: row.platform,
    media: row.media,
    path: row.path,
    language: row.language,
    note: row.note,
    clicks: row.clicks,
    lastClickedAt: row.last_clicked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

function toToken(row: TokenRow): Token {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scope: row.scope,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    lastUsedAt: row.last_used_at,
  };
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}

export function createStore(db: D1Database) {
  return {
    async campaign(slug: string): Promise<Campaign | null> {
      const row = await db
        .prepare('SELECT * FROM campaigns WHERE slug = ?')
        .bind(slug)
        .first<CampaignRow>();
      return row ? toCampaign(row) : null;
    },

    async campaigns(includeArchived: boolean): Promise<Campaign[]> {
      const { results } = await db
        .prepare(
          `SELECT * FROM campaigns ${includeArchived ? '' : 'WHERE archived_at IS NULL'} ORDER BY created_at DESC, slug`,
        )
        .all<CampaignRow>();
      return results.map(toCampaign);
    },

    async createCampaign(slug: string, name: string, description: string | null, now: string) {
      const row = await db
        .prepare(
          `INSERT INTO campaigns (id, slug, name, description, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
        )
        .bind(crypto.randomUUID(), slug, name, description, now, now)
        .first<CampaignRow>();
      return toCampaign(row as CampaignRow);
    },

    async updateCampaign(
      slug: string,
      changes: { name?: string | undefined; description?: string | null | undefined },
      now: string,
    ): Promise<Campaign | null> {
      const row = await db
        .prepare(
          `UPDATE campaigns SET
             name = CASE WHEN ?1 THEN ?2 ELSE name END,
             description = CASE WHEN ?3 THEN ?4 ELSE description END,
             updated_at = ?5
           WHERE slug = ?6 RETURNING *`,
        )
        .bind(
          changes.name === undefined ? 0 : 1,
          changes.name ?? null,
          changes.description === undefined ? 0 : 1,
          changes.description ?? null,
          now,
          slug,
        )
        .first<CampaignRow>();
      return row ? toCampaign(row) : null;
    },

    async archiveCampaign(slug: string, now: string): Promise<Campaign | null> {
      const row = await db
        .prepare(
          `UPDATE campaigns SET archived_at = COALESCE(archived_at, ?1), updated_at = ?1
           WHERE slug = ?2 RETURNING *`,
        )
        .bind(now, slug)
        .first<CampaignRow>();
      return row ? toCampaign(row) : null;
    },

    async link(slug: string): Promise<LinkRecord | null> {
      const row = await db.prepare(`${LINK_SELECT} WHERE l.slug = ?`).bind(slug).first<LinkRow>();
      return row ? toLink(row) : null;
    },

    async links(campaign: string | undefined, includeArchived: boolean): Promise<LinkRecord[]> {
      const conditions = [
        ...(campaign === undefined ? [] : ['c.slug = ?']),
        ...(includeArchived ? [] : ['l.archived_at IS NULL', 'c.archived_at IS NULL']),
      ];
      const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
      const statement = db.prepare(`${LINK_SELECT}${where} ORDER BY l.created_at DESC, l.slug`);
      const { results } = await (
        campaign === undefined ? statement : statement.bind(campaign)
      ).all<LinkRow>();
      return results.map(toLink);
    },

    async createLink(link: NewLink, now: string): Promise<void> {
      await db
        .prepare(
          `INSERT INTO links (id, slug, campaign_id, platform, media, path, language, note, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          link.slug,
          link.campaignId,
          link.platform,
          link.media,
          link.path,
          link.language,
          link.note,
          now,
          now,
        )
        .run();
    },

    async updateLink(slug: string, changes: LinkChanges, now: string): Promise<boolean> {
      const row = await db
        .prepare(
          `UPDATE links SET
             platform = COALESCE(?1, platform),
             media = COALESCE(?2, media),
             path = COALESCE(?3, path),
             language = COALESCE(?4, language),
             note = CASE WHEN ?5 THEN ?6 ELSE note END,
             updated_at = ?7
           WHERE slug = ?8 RETURNING id`,
        )
        .bind(
          changes.platform ?? null,
          changes.media ?? null,
          changes.path ?? null,
          changes.language ?? null,
          changes.note === undefined ? 0 : 1,
          changes.note ?? null,
          now,
          slug,
        )
        .first();
      return row !== null;
    },

    async archiveLink(slug: string, now: string): Promise<boolean> {
      const row = await db
        .prepare(
          `UPDATE links SET archived_at = COALESCE(archived_at, ?1), updated_at = ?1
           WHERE slug = ?2 RETURNING id`,
        )
        .bind(now, slug)
        .first();
      return row !== null;
    },

    async recordClick(linkId: string, now: string): Promise<void> {
      await db.batch([
        db
          .prepare('UPDATE links SET clicks = clicks + 1, last_clicked_at = ? WHERE id = ?')
          .bind(now, linkId),
        db
          .prepare(
            `INSERT INTO link_daily_clicks (link_id, day, clicks) VALUES (?, ?, 1)
             ON CONFLICT (link_id, day) DO UPDATE SET clicks = clicks + 1`,
          )
          .bind(linkId, now.slice(0, 10)),
      ]);
    },

    async dailyClicks(linkId: string, since: string): Promise<{ day: string; clicks: number }[]> {
      const { results } = await db
        .prepare(
          'SELECT day, clicks FROM link_daily_clicks WHERE link_id = ? AND day >= ? ORDER BY day',
        )
        .bind(linkId, since)
        .all<{ day: string; clicks: number }>();
      return results;
    },

    async createToken(
      token: { name: string; prefix: string; hash: string; scope: Scope; expiresAt: string | null },
      now: string,
    ): Promise<Token> {
      const row = await db
        .prepare(
          `INSERT INTO tokens (id, name, prefix, hash, scope, created_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING ${TOKEN_COLUMNS}`,
        )
        .bind(
          crypto.randomUUID(),
          token.name,
          token.prefix,
          token.hash,
          token.scope,
          now,
          token.expiresAt,
        )
        .first<TokenRow>();
      return toToken(row as TokenRow);
    },

    async tokens(): Promise<Token[]> {
      const { results } = await db
        .prepare(`SELECT ${TOKEN_COLUMNS} FROM tokens ORDER BY created_at DESC, id`)
        .all<TokenRow>();
      return results.map(toToken);
    },

    async activeToken(hash: string, now: string): Promise<Token | null> {
      const row = await db
        .prepare(
          `SELECT ${TOKEN_COLUMNS} FROM tokens
           WHERE hash = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)`,
        )
        .bind(hash, now)
        .first<TokenRow>();
      return row ? toToken(row) : null;
    },

    async touchToken(id: string, now: string, staleBefore: string): Promise<void> {
      await db
        .prepare(
          'UPDATE tokens SET last_used_at = ? WHERE id = ? AND (last_used_at IS NULL OR last_used_at < ?)',
        )
        .bind(now, id, staleBefore)
        .run();
    },

    async revokeToken(id: string, now: string): Promise<Token | null> {
      const row = await db
        .prepare(
          `UPDATE tokens SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ? RETURNING ${TOKEN_COLUMNS}`,
        )
        .bind(now, id)
        .first<TokenRow>();
      return row ? toToken(row) : null;
    },
  };
}

export type Store = ReturnType<typeof createStore>;
