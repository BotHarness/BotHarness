import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { groupProfileActivity } from '../src/channels/profile-activity.js';
import { createChannelStore, MAX_MESSAGE_PAGE } from '../src/channels/store.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Group Profile activity', () => {
  it('counts committed messages across pages by local day and author', async () => {
    const root = mkdtempSync(join(tmpdir(), 'botharness-group-profile-'));
    roots.push(root);
    const channels = createChannelStore({ rootDir: root });
    const group = channels.createGroup({ name: 'Research', members: ['ada'] });
    const now = new Date('2026-09-30T12:00:00.000Z');
    for (let index = 0; index < MAX_MESSAGE_PAGE + 2; index += 1) {
      await channels.appendMessage(group.id, {
        id: `msg-${index}`,
        at: new Date(Date.parse('2026-09-29T12:00:00.000Z') + index * 1000).toISOString(),
        author: index % 2 === 0 ? { kind: 'human' } : { kind: 'bot', slug: 'ada' },
        body: `Message ${index}`,
      });
    }
    await channels.appendMessage(group.id, {
      id: 'old-message',
      at: '2025-01-01T12:00:00.000Z',
      author: { kind: 'human' },
      body: 'Outside the window',
    });

    const activity = groupProfileActivity(channels, group.id, now);
    expect(activity.channelId).toBe(group.id);
    expect(activity.days.reduce((total, day) => total + day.count, 0)).toBe(MAX_MESSAGE_PAGE + 2);
    expect(activity.authors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          author: { kind: 'human' },
          total: (MAX_MESSAGE_PAGE + 2) / 2,
        }),
        expect.objectContaining({
          author: { kind: 'bot', slug: 'ada' },
          total: (MAX_MESSAGE_PAGE + 2) / 2,
        }),
      ]),
    );
  });
});
