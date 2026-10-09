import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GroupChannelIcon, groupAvatarStackBots } from '../src/client/group-avatar-stack.js';
import { zhTranslate } from '../src/client/locale.js';
import type { BotSummary, ChannelSummary } from '../src/client/store.js';

const AT = '2026-10-09T00:00:00.000Z';
const SLUGS = ['ada', 'bea', 'cy', 'dee', 'eve', 'fay'];
const bot = (slug: string): BotSummary => ({
  slug,
  displayName: slug.toUpperCase(),
  roles: [],
  aggregateState: 'working',
  workspaces: [],
  createdAt: AT,
});
const BOTS = new Map(SLUGS.map((slug) => [slug, bot(slug)]));
const group = (members: string[], avatar?: string): ChannelSummary => ({
  id: 'group-stack',
  type: 'group',
  name: 'Launch crew',
  members,
  ...(avatar === undefined ? {} : { avatar }),
  createdAt: AT,
  updatedAt: AT,
});
const render = (channel: ChannelSummary): string =>
  renderToStaticMarkup(
    createElement(GroupChannelIcon, {
      channel,
      bots: BOTS,
      className: 'bh-channel-slot',
      groupClassName: 'bh-group-channel-slot',
      size: 34,
      hashSize: 18,
      t: zhTranslate,
    }),
  );
const faces = (html: string): string[] =>
  [...html.matchAll(/class="bh-persona-avatar"[^>]*title="([^" ]+) ·/gu)].map((match) => match[1]!);

describe('GroupChannelIcon', () => {
  it('falls back to the hash tile with no Bot members', () => {
    const html = render(group([]));
    expect(html).toContain('<span class="bh-channel-slot" aria-hidden="true"><svg');
    expect(html).not.toContain('bh-group-avatar-stack');
  });

  it('shows a single member as one larger face on the Group tile', () => {
    const html = render(group(['ada']));
    expect(html).toContain('bh-channel-slot bh-group-channel-slot');
    expect(html).toContain('data-count="1"');
    expect(faces(html)).toEqual(['ADA']);
    expect(html).toContain('width:27px;height:27px');
  });

  it('stacks four members in member order', () => {
    const html = render(group(['dee', 'ada', 'cy', 'bea']));
    expect(html).toContain('data-count="4"');
    expect(faces(html)).toEqual(['DEE', 'ADA', 'CY', 'BEA']);
    expect(html).toContain('width:20px;height:20px');
  });

  it('caps six members at four faces without an overflow chip', () => {
    const html = render(group(SLUGS));
    expect(faces(html)).toEqual(['ADA', 'BEA', 'CY', 'DEE']);
    expect(html).not.toContain('+2');
    expect(html).not.toContain('bh-avatar-facepile-overflow');
  });

  it('keeps faces static: idle, still, and without status indicators', () => {
    const html = render(group(['ada', 'bea']));
    expect(html.match(/data-state="idle"/gu)).toHaveLength(2);
    expect(html).not.toContain('data-active="true"');
    expect(html).not.toContain('bh-avatar-indicator');
  });

  it('prefers an uploaded Group avatar over member faces', () => {
    const html = render(group(SLUGS, 'avatar.webp'));
    expect(html).toContain('<img class="bh-group-avatar-image" src="avatar.webp"');
    expect(html).not.toContain('bh-group-avatar-stack');
  });
});

describe('groupAvatarStackBots', () => {
  it('drops slugs that no longer resolve to a Bot and refills from later members', () => {
    expect(
      groupAvatarStackBots(['gone', 'ada', 'left', 'bea', 'cy', 'dee', 'eve'], BOTS).map(
        (entry) => entry.slug,
      ),
    ).toEqual(['ada', 'bea', 'cy', 'dee']);
  });
});
