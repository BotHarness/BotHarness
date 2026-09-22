import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { ChannelMessage } from '../src/channels/channel.js';
import {
  CHANNEL_STREAM_PATH,
  createChannelLiveHub,
  type ChannelLiveHub,
} from '../src/channels/live.js';
import { createChannelStore, type ChannelMessageCommit } from '../src/channels/store.js';

const roots: string[] = [];
const hubs: ChannelLiveHub[] = [];

function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'botharness-live-'));
  roots.push(value);
  return value;
}

function message(id: string): ChannelMessage {
  return {
    id,
    at: '2026-09-21T00:00:00.000Z',
    author: { kind: 'human' },
    body: id,
  };
}

afterEach(() => {
  for (const hub of hubs.splice(0)) hub.close();
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

describe('Channel post-commit stream', () => {
  it('registers the full authenticated Connection Fetch pathname', () => {
    expect(CHANNEL_STREAM_PATH).toBe('/api/botharness/stream');
  });

  it('publishes only durable rows and replays from the snapshot cursor', async () => {
    const directory = root();
    const observed: ChannelMessageCommit[] = [];
    let hub: ChannelLiveHub | undefined;
    const store = createChannelStore({
      rootDir: directory,
      onCommitted(commit) {
        expect(
          readFileSync(join(directory, commit.channelId, 'messages.ndjson'), 'utf8'),
        ).toContain(commit.message.id);
        observed.push(commit);
        hub?.publishCommitted(commit);
      },
    });
    hub = createChannelLiveHub(store);
    hubs.push(hub);
    const channel = store.createGroup({ name: 'Team', members: [] });
    await store.appendMessage(channel.id, message('one'));

    const response = hub.open(
      new Request(`http://localhost/api/botharness/stream?channelId=${channel.id}&after=0`),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/event-stream');
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    const first = await reader?.read();
    expect(new TextDecoder().decode(first?.value)).toContain('retry: 1500');
    const replay = await reader?.read();
    expect(new TextDecoder().decode(replay?.value)).toContain('id: 1\nevent: channel/message');
    expect(new TextDecoder().decode(replay?.value)).toContain('"body":"one"');
    expect(new TextDecoder().decode((await reader?.read())?.value)).toContain(
      'event: channel/draft-baseline',
    );

    await store.appendMessage(channel.id, message('two'));
    const live = await reader?.read();
    expect(new TextDecoder().decode(live?.value)).toContain('id: 2\nevent: channel/message');
    expect(observed.map((entry) => entry.revision)).toEqual([1, 2]);
    await reader?.cancel();
  });

  it('rebuilds revisions after restart and resumes only unseen committed messages', async () => {
    const directory = root();
    const first = createChannelStore({ rootDir: directory });
    const channel = first.createGroup({ name: 'Team', members: [] });
    await first.appendMessage(channel.id, message('one'));
    await first.appendMessage(channel.id, message('two'));

    const restarted = createChannelStore({ rootDir: directory });
    expect(restarted.revision(channel.id)).toBe(2);
    expect(restarted.messagesAfter(channel.id, 1)?.map((entry) => entry.message.body)).toEqual([
      'two',
    ]);
    const hub = createChannelLiveHub(restarted);
    hubs.push(hub);
    const response = hub.open(
      new Request(`http://localhost/api/botharness/stream?channelId=${channel.id}&after=0`, {
        headers: { 'Last-Event-ID': '1' },
      }),
    );
    const reader = response.body?.getReader();
    await reader?.read(); // retry
    const replay = await reader?.read();
    expect(new TextDecoder().decode(replay?.value)).toContain('id: 2\nevent: channel/message');
    await reader?.cancel();
  });

  it('streams a committed PersonaBot DM reply through the same Channel path', async () => {
    let hub: ChannelLiveHub | undefined;
    const store = createChannelStore({
      rootDir: root(),
      onCommitted: (commit) => hub?.publishCommitted(commit),
    });
    const dm = store.getOrCreateDm('persona-live', 'Live Bot');
    expect(dm).toBeDefined();
    if (dm === undefined) return;
    hub = createChannelLiveHub(store);
    hubs.push(hub);
    const reader = hub
      .open(new Request(`http://localhost${CHANNEL_STREAM_PATH}?channelId=${dm.id}&after=0`))
      .body?.getReader();
    await reader?.read(); // retry
    await reader?.read(); // draft baseline
    await store.appendMessage(dm.id, {
      ...message('reply'),
      author: { kind: 'bot', slug: 'persona-live' },
    });
    const streamed = await reader?.read();
    expect(new TextDecoder().decode(streamed?.value)).toContain('"kind":"bot"');
    expect(new TextDecoder().decode(streamed?.value)).toContain('"body":"reply"');
    await reader?.cancel();
  });

  it('streams transient DM drafts without advancing the durable revision and settles once', async () => {
    let hub: ChannelLiveHub | undefined;
    const store = createChannelStore({
      rootDir: root(),
      onCommitted: (commit) => hub?.publishCommitted(commit),
    });
    const dm = store.getOrCreateDm('ada', 'Ada');
    expect(dm).toBeDefined();
    if (dm === undefined) return;
    hub = createChannelLiveHub(store);
    hubs.push(hub);
    const reader = hub
      .open(new Request(`http://localhost${CHANNEL_STREAM_PATH}?channelId=${dm.id}&after=0`))
      .body?.getReader();
    await reader?.read(); // retry
    expect(new TextDecoder().decode((await reader?.read())?.value)).toContain(
      'event: channel/draft-baseline',
    );
    hub.publishDraft({
      type: 'update',
      draft: {
        channelId: dm.id,
        draftId: 'attempt:call',
        attemptId: 'attempt',
        botSlug: 'ada',
        body: '你',
      },
    });
    const first = new TextDecoder().decode((await reader?.read())?.value);
    expect(first).toContain('event: channel/draft');
    expect(first).toContain('"body":"你"');
    expect(first).not.toContain('id: ');
    expect(store.revision(dm.id)).toBe(0);
    hub.publishDraft({
      type: 'update',
      draft: {
        channelId: dm.id,
        draftId: 'attempt:call',
        attemptId: 'attempt',
        botSlug: 'ada',
        body: '你好',
      },
    });
    expect(new TextDecoder().decode((await reader?.read())?.value)).toContain('"body":"你好"');
    await store.appendMessage(dm.id, {
      ...message('reply'),
      author: { kind: 'bot', slug: 'ada' },
      body: '你好',
    });
    expect(new TextDecoder().decode((await reader?.read())?.value)).toContain(
      'event: channel/message',
    );
    expect(new TextDecoder().decode((await reader?.read())?.value)).toContain(
      'event: channel/draft-settled',
    );
    hub.publishDraft({
      type: 'settled',
      channelId: dm.id,
      draftId: 'attempt:call',
      attemptId: 'attempt',
    });
    expect(store.revision(dm.id)).toBe(1);
    await reader?.cancel();
  });

  it('settles the sole Bot draft when the final body corrects its partial text', async () => {
    let hub: ChannelLiveHub | undefined;
    const store = createChannelStore({
      rootDir: root(),
      onCommitted: (commit) => hub?.publishCommitted(commit),
    });
    const dm = store.getOrCreateDm('ada', 'Ada');
    expect(dm).toBeDefined();
    if (dm === undefined) return;
    hub = createChannelLiveHub(store);
    hubs.push(hub);
    hub.publishDraft({
      type: 'update',
      draft: {
        channelId: dm.id,
        draftId: 'attempt:call',
        attemptId: 'attempt',
        botSlug: 'ada',
        body: 'partial',
      },
    });
    await store.appendMessage(dm.id, {
      ...message('reply'),
      author: { kind: 'bot', slug: 'ada' },
      body: 'corrected',
    });
    const reader = hub
      .open(new Request(`http://localhost${CHANNEL_STREAM_PATH}?channelId=${dm.id}&after=1`))
      .body?.getReader();
    await reader?.read(); // retry
    const baseline = new TextDecoder().decode((await reader?.read())?.value);
    expect(baseline).toContain('"drafts":[]');
    await reader?.cancel();
  });

  it('rejects unknown Channels and malformed or future revisions', () => {
    const store = createChannelStore({ rootDir: root() });
    const channel = store.createGroup({ name: 'Team', members: [] });
    const hub = createChannelLiveHub(store);
    hubs.push(hub);
    expect(
      hub.open(new Request('http://localhost/api/botharness/stream?channelId=missing&after=0'))
        .status,
    ).toBe(404);
    expect(
      hub.open(
        new Request(`http://localhost/api/botharness/stream?channelId=${channel.id}&after=-1`),
      ).status,
    ).toBe(400);
    expect(
      hub.open(
        new Request(`http://localhost/api/botharness/stream?channelId=${channel.id}&after=9`),
      ).status,
    ).toBe(409);
  });
});
