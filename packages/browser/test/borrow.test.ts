import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBorrowService, type BorrowService } from '../src/borrow.js';

const origin = `chrome-extension://${'a'.repeat(32)}`;
const services: BorrowService[] = [];
afterEach(() => {
  for (const service of services.splice(0)) service.dispose();
  vi.useRealTimers();
});

function setup() {
  let now = 1;
  let enabled = true;
  const access = new Set(['a', 'b']);
  const changed = vi.fn();
  const note = vi.fn();
  const service = createBorrowService({
    now: () => now,
    enabled: () => enabled,
    bot: (slug) => ({ displayName: `Bot ${slug}`, browserAccess: access.has(slug) }),
    onChange: changed,
    note,
  });
  services.push(service);
  const connect = (slug = 'a', tabId = 1) => {
    const pair = service.pair(slug);
    const lease = service.redeem(pair.code, origin);
    service.share(lease.token, origin, {
      tabId,
      url: 'https://example.com/page',
      title: 'Example',
    });
    return lease;
  };
  return {
    service,
    connect,
    access,
    changed,
    note,
    time: (value: number) => {
      now = value;
    },
    disable: () => {
      enabled = false;
    },
  };
}

const observation = {
  url: 'https://example.com/page',
  title: 'Example',
  text: 'Readable page',
  elements: [{ ref: 'r1', role: 'button', name: 'Search' }],
};

describe('explicit daily-browser borrowing authority', () => {
  it('uses expiring one-use pairing and refuses web origins without consuming consent', () => {
    const h = setup();
    const pair = h.service.pair('a');
    expect(() => h.service.redeem(pair.code, 'https://example.com')).toThrow('extension origin');
    expect(h.service.redeem(pair.code, origin).displayName).toBe('Bot a');
    expect(() => h.service.redeem(pair.code, origin)).toThrow('already used');
    const expired = h.service.pair('b');
    h.time(300_002);
    expect(() => h.service.redeem(expired.code, origin)).toThrow('expired');
    expect(h.service.view('a')).toBeUndefined();
  });
  it('only observes the explicitly shared tab for its current PersonaBot', async () => {
    const h = setup();
    const lease = h.connect();
    await expect(h.service.observe('b', new AbortController().signal)).rejects.toThrow(
      'No daily-browser tab',
    );
    const result = h.service.observe('a', new AbortController().signal);
    const command = (await h.service.poll(lease.token, origin, new AbortController().signal)) as {
      id: string;
      tabId: number;
      method: string;
      url: string;
    };
    expect(command).toMatchObject({ method: 'observe', tabId: 1, url: observation.url });
    expect(() =>
      h.service.result(lease.token, `chrome-extension://${'b'.repeat(32)}`, {
        id: command.id,
        observation,
      }),
    ).toThrow('unavailable');
    h.service.result(lease.token, origin, { id: command.id, observation });
    await expect(result).resolves.toEqual(observation);
    expect(h.note.mock.calls.flat().join(' ')).not.toContain(lease.token);
    expect(h.note.mock.calls.flat().join(' ')).not.toContain(observation.url);
  });
  it('refuses overlapping Bot consent to the same tab and leaves the first lease intact', () => {
    const h = setup();
    h.connect();
    const pair = h.service.pair('b');
    const other = h.service.redeem(pair.code, origin);
    expect(() =>
      h.service.share(other.token, origin, { tabId: 1, url: observation.url, title: 'Example' }),
    ).toThrow('another PersonaBot');
    expect(h.service.view('a')).toMatchObject({ url: observation.url });
    expect(h.service.view('b')).toBeUndefined();
  });
  it('returns the tab immediately and rejects a late result instead of publishing it', async () => {
    const h = setup();
    const lease = h.connect();
    const result = h.service.observe('a', new AbortController().signal);
    const failed = expect(result).rejects.toThrow('returned');
    const command = (await h.service.poll(lease.token, origin, new AbortController().signal)) as {
      id: string;
    };
    h.service.returnBot('a');
    expect(() => h.service.result(lease.token, origin, { id: command.id, observation })).toThrow(
      'unavailable',
    );
    await failed;
    expect(h.service.view('a')).toBeUndefined();
  });
  it('navigation, Access removal and target changes fence observations and revoke consent', async () => {
    for (const change of ['navigation', 'access', 'target'] as const) {
      const h = setup();
      const lease = h.connect();
      const result = h.service.observe('a', new AbortController().signal);
      const failed = expect(result).rejects.toThrow('returned');
      const command = (await h.service.poll(lease.token, origin, new AbortController().signal)) as {
        id: string;
      };
      if (change === 'access') h.access.delete('a');
      if (change === 'target') h.disable();
      if (change === 'navigation')
        h.service.result(lease.token, origin, {
          id: command.id,
          observation: { ...observation, url: 'https://example.com/other' },
        });
      else
        expect(() =>
          h.service.result(lease.token, origin, { id: command.id, observation }),
        ).toThrow('unavailable');
      await failed;
      expect(h.service.view('a')).toBeUndefined();
    }
  });
  it('expires a disconnected lease and makes Host restart discard borrowed authority', () => {
    const h = setup();
    const lease = h.connect();
    h.time(45_002);
    expect(h.service.view('a')).toBeUndefined();
    expect(() => h.service.returnToken(lease.token, origin)).toThrow('unavailable');
    h.time(45_003);
    h.connect();
    h.service.clear();
    expect(h.service.view('a')).toBeUndefined();
  });
  it('aborting a pending tool releases its command and permits a fresh observation', async () => {
    const h = setup();
    const lease = h.connect();
    const controller = new AbortController();
    const first = h.service.observe('a', controller.signal);
    const failure = expect(first).rejects.toThrow('cancelled');
    controller.abort();
    await failure;
    const next = h.service.observe('a', new AbortController().signal);
    const command = (await h.service.poll(lease.token, origin, new AbortController().signal)) as {
      id: string;
    };
    h.service.result(lease.token, origin, { id: command.id, observation });
    await expect(next).resolves.toEqual(observation);
  });
});
