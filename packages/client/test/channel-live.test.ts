import { describe, expect, it, vi } from 'vitest';

import type { BridgeActions } from '../src/client/actions.js';
import { mountChannelLive } from '../src/client/channel-live.js';
import { createStore, type ChannelSummary } from '../src/client/store.js';

const CHANNEL: ChannelSummary = {
  id: 'group-team',
  type: 'group',
  name: 'Team',
  members: [],
  createdAt: '2026-09-21T00:00:00.000Z',
  updatedAt: '2026-09-21T00:00:00.000Z',
};

class FakeSource {
  readonly listeners = new Map<string, EventListener>();
  onerror: ((event: Event) => void) | null = null;
  readyState = 1;
  closed = false;
  constructor(readonly url: string) {}
  get channelId(): string {
    return new URL(this.url, 'http://localhost').searchParams.get('channelId') ?? '';
  }
  emitDraft(id: string, body: string): void {
    this.listeners.get('channel/draft')?.(
      new MessageEvent('channel/draft', {
        data: JSON.stringify({ channelId: this.channelId, draftId: id, botSlug: 'ada', body }),
      }),
    );
  }
  endDraft(id: string): void {
    this.listeners.get('channel/draft-end')?.(
      new MessageEvent('channel/draft-end', {
        data: JSON.stringify({ channelId: this.channelId, draftId: id }),
      }),
    );
  }
  addEventListener(name: string, listener: EventListener): void {
    this.listeners.set(name, listener);
  }
  emit(revision: number, id: string): void {
    this.listeners.get('channel/message')?.(
      new MessageEvent('channel/message', {
        data: JSON.stringify({
          channelId: this.channelId,
          revision,
          message: {
            id,
            at: '2026-09-21T00:00:01.000Z',
            author: { kind: 'bot', slug: 'ada' },
            body: id,
          },
        }),
      }),
    );
  }
  close(): void {
    this.closed = true;
    this.readyState = 2;
  }
}

function setup(refresh = vi.fn(async () => undefined), channel = CHANNEL) {
  const store = createStore();
  const sources: FakeSource[] = [];
  store.setMode('bot');
  store.setRoster([], [channel]);
  store.select({ kind: 'channel', channelId: channel.id });
  store.setConversation({
    status: 'ready',
    channel,
    messages: [],
    revision: 0,
  });
  const actions = { refreshChannelMessages: refresh } as unknown as BridgeActions;
  const dispose = mountChannelLive(store, actions, (url) => {
    const source = new FakeSource(url);
    sources.push(source);
    return source as unknown as EventSource;
  });
  return { store, sources, dispose, refresh };
}

describe('Channel live Client', () => {
  it('appends once, ignores duplicate revisions, and updates the Channel preview', () => {
    const { store, sources, dispose } = setup();
    expect(sources[0]?.url).toContain('channelId=group-team&after=0');
    sources[0]?.emit(1, 'one');
    sources[0]?.emit(1, 'one');
    expect(store.getSnapshot().conversation.messages.map((message) => message.id)).toEqual(['one']);
    expect(store.getSnapshot().conversation.revision).toBe(1);
    expect(store.getSnapshot().channels[0]?.latestMessage?.id).toBe('one');
    dispose();
    expect(sources[0]?.closed).toBe(true);
  });

  it('renders a real PersonaBot DM draft before commit and removes it on the durable reply', () => {
    const dm: ChannelSummary = {
      ...CHANNEL,
      id: 'dm-ada',
      type: 'dm',
      botSlug: 'ada',
      members: ['ada'],
    };
    const { store, sources, dispose } = setup(
      vi.fn(async () => undefined),
      dm,
    );
    sources[0]?.emitDraft('attempt:call', '你');
    sources[0]?.emitDraft('attempt:call', '你好');
    expect(store.getSnapshot().conversation.drafts).toMatchObject([
      { body: '你好', botSlug: 'ada' },
    ]);
    expect(store.getSnapshot().conversation.revision).toBe(0);
    sources[0]?.emit(1, 'committed');
    expect(store.getSnapshot().conversation.drafts).toEqual([]);
    expect(store.getSnapshot().conversation.messages.map((item) => item.id)).toEqual(['committed']);
    sources[0]?.endDraft('attempt:call');
    expect(store.getSnapshot().conversation.drafts).toEqual([]);
    dispose();
  });

  it('advances the revision but does not splice live messages into an older window', () => {
    const { store, sources, dispose } = setup();
    store.setConversation({
      messages: [
        {
          id: 'old',
          at: '2026-09-21T00:00:00.000Z',
          author: { kind: 'human' },
          body: 'old',
        },
      ],
      timeline: {
        olderCursor: 'c-old',
        newerCursor: 'c-old',
        hasOlder: false,
        hasNewer: true,
        loadingOlder: false,
        olderError: undefined,
        loadingNewer: false,
        newerError: undefined,
      },
    });
    sources[0]?.emit(1, 'new');
    expect(store.getSnapshot().conversation.messages.map((item) => item.id)).toEqual(['old']);
    expect(store.getSnapshot().conversation.revision).toBe(1);
    expect(store.getSnapshot().channels[0]?.latestMessage?.id).toBe('new');
    dispose();
  });
  it('re-snapshots on a revision gap and reopens from the new cursor', async () => {
    const store = createStore();
    const sources: FakeSource[] = [];
    store.setMode('bot');
    store.setRoster([], [CHANNEL]);
    store.select({ kind: 'channel', channelId: CHANNEL.id });
    store.setConversation({ status: 'ready', channel: CHANNEL, messages: [], revision: 1 });
    const refresh = vi.fn(async () => {
      store.setConversation({ revision: 3, messages: [] });
    });
    const dispose = mountChannelLive(
      store,
      { refreshChannelMessages: refresh } as unknown as BridgeActions,
      (url) => {
        const source = new FakeSource(url);
        sources.push(source);
        return source as unknown as EventSource;
      },
    );
    sources[0]?.emit(3, 'three');
    await vi.waitFor(() => expect(sources).toHaveLength(2));
    expect(refresh).toHaveBeenCalledWith(CHANNEL.id);
    expect(sources[0]?.closed).toBe(true);
    expect(sources[1]?.url).toContain('after=3');
    dispose();
  });

  it('closes the old stream on Channel selection or mode change', () => {
    const { store, sources, dispose } = setup();
    store.select(undefined);
    expect(sources[0]?.closed).toBe(true);
    store.setConversation({ status: 'ready', channel: CHANNEL, revision: 0 });
    expect(sources).toHaveLength(2);
    store.setMode('dsh');
    expect(sources[1]?.closed).toBe(true);
    dispose();
  });
});
