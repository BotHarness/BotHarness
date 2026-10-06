import type { Campaign, CampaignClicks, Link, LinkClicks } from './client.js';

export function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => (row[column] ?? '').length)),
  );
  const line = (cells: string[]) =>
    cells
      .map((cell, column) =>
        column === cells.length - 1 ? cell : cell.padEnd(widths[column] ?? 0),
      )
      .join('  ');
  return [line(headers), ...rows.map(line)].join('\n');
}

const day = (value: string | null) => (value ? value.slice(0, 10) : '-');
const clicksLabel = (count: number) => `${count} ${count === 1 ? 'click' : 'clicks'}`;

export function formatLinks(links: Link[]): string {
  if (links.length === 0) return 'No links.';
  return table(
    ['SLUG', 'SHORT URL', 'CAMPAIGN', 'PLATFORM', 'MEDIA', 'CLICKS'],
    links.map((link) => [
      link.archivedAt ? `${link.slug} (archived)` : link.slug,
      link.shortUrl,
      link.campaign,
      link.platform,
      link.media,
      String(link.clicks),
    ]),
  );
}

export function formatCampaigns(campaigns: Campaign[]): string {
  if (campaigns.length === 0) return 'No campaigns.';
  return table(
    ['SLUG', 'NAME', 'CREATED', 'ARCHIVED'],
    campaigns.map((campaign) => [
      campaign.slug,
      campaign.name,
      day(campaign.createdAt),
      day(campaign.archivedAt),
    ]),
  );
}

export function formatLink(link: Link): string {
  return [
    `slug:       ${link.slug}`,
    `short URL:  ${link.shortUrl}`,
    `target:     ${link.target}`,
    `campaign:   ${link.campaign}`,
    `platform:   ${link.platform}`,
    `media:      ${link.media}`,
    `language:   ${link.language}`,
    `clicks:     ${link.clicks}`,
    ...(link.note ? [`note:       ${link.note}`] : []),
    ...(link.archivedAt ? [`archived:   ${link.archivedAt}`] : []),
  ].join('\n');
}

export function formatCampaign(campaign: Campaign): string {
  return [
    `slug:         ${campaign.slug}`,
    `name:         ${campaign.name}`,
    ...(campaign.description ? [`description:  ${campaign.description}`] : []),
    `created:      ${campaign.createdAt}`,
    ...(campaign.archivedAt ? [`archived:     ${campaign.archivedAt}`] : []),
  ].join('\n');
}

export function formatLinkClicks(clicks: LinkClicks): string {
  const header = `${clicks.link}: ${clicksLabel(clicks.total)}, last ${clicks.lastClickedAt ?? 'never'}`;
  if (clicks.daily.length === 0) return header;
  return `${header}\n\n${table(
    ['DAY (UTC)', 'CLICKS'],
    clicks.daily.map((entry) => [entry.day, String(entry.clicks)]),
  )}`;
}

export function formatCampaignClicks(clicks: CampaignClicks): string {
  const header = `${clicks.campaign}: ${clicksLabel(clicks.total)}`;
  if (clicks.links.length === 0) return header;
  return `${header}\n\n${table(
    ['LINK', 'PLATFORM', 'MEDIA', 'CLICKS', 'LAST CLICK'],
    clicks.links.map((link) => [
      link.archivedAt ? `${link.slug} (archived)` : link.slug,
      link.platform,
      link.media,
      String(link.clicks),
      link.lastClickedAt ?? '-',
    ]),
  )}`;
}
