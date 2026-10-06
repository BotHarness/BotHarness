import type {
  Campaign,
  CampaignClicks,
  CampaignCreate,
  CampaignUpdate,
  Link,
  LinkClicks,
  LinkCreate,
  LinkUpdate,
} from '../../links/src/schemas.js';

export type { Campaign, CampaignClicks, Link, LinkClicks };

export interface ClientOptions {
  url: string;
  token: string;
  fetch?: typeof fetch;
}

export class LinksApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly issues: { path: string; message: string }[] = [],
  ) {
    super(
      [
        `${code} (HTTP ${status})`,
        ...issues.map((issue) => `  ${issue.path}: ${issue.message}`),
      ].join('\n'),
    );
    this.name = 'LinksApiError';
  }
}

const segment = (slug: string) => encodeURIComponent(slug);

function query(values: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) params.set(key, value);
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

export function createClient(options: ClientOptions) {
  const base = options.url.replace(/\/+$/, '');
  const fetcher = options.fetch ?? fetch;

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetcher(`${base}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${options.token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      const error = (payload as { error?: { code?: string; issues?: [] } } | null)?.error;
      throw new LinksApiError(response.status, error?.code ?? 'http-error', error?.issues ?? []);
    }
    return payload as T;
  }

  const archived = (includeArchived?: boolean) => (includeArchived ? 'true' : undefined);

  return {
    campaigns: async (includeArchived?: boolean) =>
      (
        await call<{ campaigns: Campaign[] }>(
          'GET',
          `/v1/campaigns${query({ includeArchived: archived(includeArchived) })}`,
        )
      ).campaigns,
    campaign: (slug: string) => call<Campaign>('GET', `/v1/campaigns/${segment(slug)}`),
    createCampaign: (input: CampaignCreate) => call<Campaign>('POST', '/v1/campaigns', input),
    updateCampaign: (slug: string, changes: CampaignUpdate) =>
      call<Campaign>('PATCH', `/v1/campaigns/${segment(slug)}`, changes),
    archiveCampaign: (slug: string) =>
      call<Campaign>('POST', `/v1/campaigns/${segment(slug)}/archive`),
    campaignClicks: (slug: string) =>
      call<CampaignClicks>('GET', `/v1/campaigns/${segment(slug)}/clicks`),
    links: async (
      filter: { campaign?: string | undefined; includeArchived?: boolean | undefined } = {},
    ) =>
      (
        await call<{ links: Link[] }>(
          'GET',
          `/v1/links${query({ campaign: filter.campaign, includeArchived: archived(filter.includeArchived) })}`,
        )
      ).links,
    link: (slug: string) => call<Link>('GET', `/v1/links/${segment(slug)}`),
    createLink: (input: LinkCreate) => call<Link>('POST', '/v1/links', input),
    updateLink: (slug: string, changes: LinkUpdate) =>
      call<Link>('PATCH', `/v1/links/${segment(slug)}`, changes),
    archiveLink: (slug: string) => call<Link>('POST', `/v1/links/${segment(slug)}/archive`),
    linkClicks: (slug: string, days?: number) =>
      call<LinkClicks>(
        'GET',
        `/v1/links/${segment(slug)}/clicks${query({ days: days === undefined ? undefined : String(days) })}`,
      ),
  };
}

export type LinksClient = ReturnType<typeof createClient>;
