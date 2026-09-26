import { describe, expect, it } from 'vitest';

import { createActions } from '../src/client/actions.js';
import type { BridgeCall } from '../src/client/bridge.js';
import {
  createStore,
  type HumanAttentionItem,
  type HumanAttentionPage,
} from '../src/client/store.js';

function item(id: string): HumanAttentionItem {
  return {
    id,
    category: 'action',
    kind: 'group-join-request',
    createdAt: '2026-09-26T00:00:00.000Z',
    channelId: 'group-team',
    channelName: 'Team',
    botSlug: 'ada',
    summary: id,
    requestId: id,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('Human Inbox pagination refresh', () => {
  it('keeps loaded older items and their cursor across a background refresh', async () => {
    const clientStore = createStore();
    clientStore.select({ kind: 'inbox' });
    const first = Array.from({ length: 50 }, (_, index) => item('id-' + index));
    const responses: HumanAttentionPage[] = [
      { items: first, nextCursor: 'cursor-1' },
      { items: [item('id-50')], nextCursor: 'cursor-2' },
      { items: [item('new'), ...first], nextCursor: 'cursor-new' },
    ];
    const call: BridgeCall = async () => ({ ok: true, value: responses.shift() });
    const actions = createActions(call, clientStore);
    await actions.refreshHumanInbox();
    await actions.loadMoreHumanInbox();
    await actions.refreshHumanInbox();
    const inbox = clientStore.getSnapshot().humanInbox;
    expect(inbox.items).toHaveLength(52);
    expect(inbox.items[0]?.id).toBe('new');
    expect(inbox.items.at(-1)?.id).toBe('id-50');
    expect(inbox.nextCursor).toBe('cursor-2');
  });

  it('keeps an in-flight load-more result when a background refresh completes first', async () => {
    const clientStore = createStore();
    clientStore.select({ kind: 'inbox' });
    const first = Array.from({ length: 50 }, (_, index) => item('id-' + index));
    const older = deferred<HumanAttentionPage>();
    const responses = [
      Promise.resolve({ items: first, nextCursor: 'cursor-1' }),
      older.promise,
      Promise.resolve({ items: [item('new'), ...first.slice(0, 49)], nextCursor: 'cursor-new' }),
    ];
    const call: BridgeCall = async () => ({ ok: true, value: await responses.shift()! });
    const actions = createActions(call, clientStore);
    await actions.refreshHumanInbox();
    const loadMore = actions.loadMoreHumanInbox();
    await actions.refreshHumanInbox();
    older.resolve({ items: [item('id-50')], nextCursor: 'cursor-2' });
    await loadMore;
    const inbox = clientStore.getSnapshot().humanInbox;
    expect(inbox.items.map((entry) => entry.id)).toContain('id-50');
    expect(inbox.nextCursor).toBe('cursor-2');
  });

  it('discards an old category response after switching category', async () => {
    const clientStore = createStore();
    clientStore.select({ kind: 'inbox' });
    const old = deferred<HumanAttentionPage>();
    const responses = [old.promise, Promise.resolve({ items: [], nextCursor: undefined })];
    const call: BridgeCall = async () => ({ ok: true, value: await responses.shift()! });
    const actions = createActions(call, clientStore);
    const before = actions.refreshHumanInbox();
    await actions.refreshHumanInbox('info');
    old.resolve({ items: [item('stale')] });
    await before;
    expect(clientStore.getSnapshot().humanInbox.category).toBe('info');
    expect(clientStore.getSnapshot().humanInbox.items).toEqual([]);
  });
});
