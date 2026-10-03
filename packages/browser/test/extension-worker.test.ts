import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const workerSource = readFileSync(
  new URL('../extension/worker.mjs', import.meta.url),
  'utf8',
).replace(/^import .*;\n/u, '');
type Config = {
  host: string;
  token: string;
  displayName: string;
  tabId?: number;
  url?: string;
  documentId?: string;
  sharingTabId?: number;
};

function fixture(initial?: Config) {
  let config = initial;
  let message!: (input: unknown, sender: unknown, reply: (value: any) => void) => boolean;
  let updated!: (id: number, change: unknown) => void;
  const polls: string[] = [];
  const badge = vi.fn(async () => undefined);
  const shares = vi.fn(async () => ({ ok: true, value: null }));
  const chrome = {
    storage: {
      session: {
        get: async () => ({ borrowedTab: config }),
        set: async (input: { borrowedTab: Config }) => {
          config = input.borrowedTab;
        },
        remove: async () => {
          config = undefined;
        },
      },
    },
    action: { setBadgeText: badge },
    tabs: {
      query: async () => [{ id: 7, url: 'https://example.com/page', title: 'QA' }],
      get: async () => ({ url: 'https://example.com/page' }),
      onRemoved: { addListener: vi.fn() },
      onUpdated: {
        addListener: (fn: typeof updated) => {
          updated = fn;
        },
      },
    },
    scripting: {
      executeScript: async () => [{ result: 'https://example.com/page', documentId: 'document-1' }],
    },
    runtime: {
      id: 'qa-extension',
      getURL: (path: string) => 'chrome-extension://qa-extension/' + path,
      onMessage: {
        addListener: (fn: typeof message) => {
          message = fn;
        },
      },
      onStartup: { addListener: vi.fn() },
    },
    alarms: { create: vi.fn(), onAlarm: { addListener: vi.fn() } },
  };
  const fetch = vi.fn(
    async (url: string, init: { headers: { authorization?: string }; signal: AbortSignal }) => {
      const action = url.split('/').at(-1);
      if (action === 'poll') {
        polls.push(init.headers.authorization ?? '');
        return await new Promise<Response>((_resolve, reject) => {
          if (init.signal.aborted) reject(new Error('aborted'));
          else
            init.signal.addEventListener('abort', () => reject(new Error('aborted')), {
              once: true,
            });
        });
      }
      if (action === 'share') return Response.json(await shares());
      return Response.json({
        ok: true,
        value: action === 'pair' ? { token: 'new-lease', displayName: 'QA' } : null,
      });
    },
  );
  runInNewContext(workerSource, {
    chrome,
    fetch,
    AbortController,
    AbortSignal,
    URL,
    readPage: vi.fn(),
  });
  const send = (action: string) =>
    new Promise<{ ok: boolean; error?: string }>((resolve) => {
      message(
        { action, host: 'http://127.0.0.1:3140', code: 'synthetic' },
        { id: chrome.runtime.id, url: chrome.runtime.getURL('popup.html') },
        resolve,
      );
    });
  return { send, updated, shares, polls, badge, config: () => config };
}

describe('MV3 worker lease transitions', () => {
  it('starts a new poll immediately after Return/re-pair without waiting for the alarm', async () => {
    const f = fixture({
      host: 'http://127.0.0.1:3140',
      token: 'old-lease',
      displayName: 'QA',
      tabId: 7,
      url: 'https://example.com/page',
      documentId: 'document-1',
    });
    await vi.waitFor(() => expect(f.polls).toContain('Bearer old-lease'));
    expect((await f.send('return')).ok).toBe(true);
    expect((await f.send('pair')).ok).toBe(true);
    expect((await f.send('share')).ok).toBe(true);
    await vi.waitFor(() => expect(f.polls).toContain('Bearer new-lease'));
    expect(f.config()?.token).toBe('new-lease');
    expect(f.badge.mock.calls.at(-1)).toEqual([{ text: 'READ' }]);
    await f.send('return');
  });
  it('navigation during Host Share removes pending consent and cannot resurrect the old document', async () => {
    const f = fixture();
    await f.send('pair');
    let finish!: () => void;
    f.shares.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return { ok: true, value: null };
    });
    const share = f.send('share');
    await vi.waitFor(() => expect(f.config()?.sharingTabId).toBe(7));
    f.updated(7, { status: 'loading' });
    await vi.waitFor(() => expect(f.config()).toBeUndefined());
    finish();
    expect((await share).ok).toBe(false);
    expect(f.config()).toBeUndefined();
    expect(f.polls).toHaveLength(0);
  });
});
