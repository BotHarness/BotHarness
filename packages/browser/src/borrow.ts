import { randomBytes } from 'node:crypto';
import type { BrowserObservation } from './runtime/browser.js';

export const BORROW_PREFIX = '/botharness-browser/extension/';
const PAIR_MS = 5 * 60_000;
const HEARTBEAT_MS = 45_000;
const LEASE_MS = 30 * 60_000;
const COMMAND_MS = 12_000;

interface PendingObservation {
  readonly id: string;
  readonly resolve: (value: BrowserObservation) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
  delivered: boolean;
}

interface Lease {
  readonly token: string;
  readonly slug: string;
  readonly displayName: string;
  readonly origin: string;
  expires: number;
  tab: { id: number; url: string; title: string } | undefined;
  heartbeat: number;
  pending: PendingObservation | undefined;
  wake: (() => void) | undefined;
}

export interface BorrowView {
  readonly title: string;
  readonly url: string;
  readonly expiresAt: number;
}

export interface BorrowService {
  readonly revision: number;
  pair(slug: string): { code: string; expiresAt: number };
  redeem(code: string, origin: string): { token: string; displayName: string };
  share(token: string, origin: string, input: unknown): BorrowView;
  poll(token: string, origin: string, signal: AbortSignal): Promise<unknown>;
  result(token: string, origin: string, input: unknown): void;
  returnToken(token: string, origin: string): void;
  returnBot(slug: string): void;
  view(slug: string): BorrowView | undefined;
  observe(slug: string, signal: AbortSignal): Promise<BrowserObservation>;
  clear(): void;
  dispose(): void;
}

function text(value: unknown, limit: number): string {
  if (typeof value !== 'string' || value.length > limit) throw new Error('Invalid extension reply');
  return value;
}

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid extension request');
  return value as Record<string, unknown>;
}

export function extensionOrigin(value: string): boolean {
  return /^chrome-extension:\/\/[a-p]{32}$/u.test(value);
}

export function createBorrowService(options: {
  readonly bot: (slug: string) => { displayName: string; browserAccess: boolean } | undefined;
  readonly enabled: () => boolean;
  readonly onChange: (slug: string) => void;
  readonly note: (event: string) => void;
  readonly now?: () => number;
}): BorrowService {
  const now = options.now ?? Date.now;
  const pairs = new Map<string, { slug: string; expires: number }>();
  const leases = new Map<string, Lease>();
  let revision = 0;
  let disposed = false;
  const allowed = (slug: string): void => {
    if (disposed || !options.enabled() || options.bot(slug)?.browserAccess !== true)
      throw new Error('Daily Browser Access is unavailable for this PersonaBot');
  };
  const remove = (lease: Lease, reason: string): void => {
    if (!leases.delete(lease.token)) return;
    if (lease.pending !== undefined) {
      clearTimeout(lease.pending.timer);
      lease.pending.reject(new Error(`Borrowed tab returned: ${reason}`));
    }
    lease.wake?.();
    revision += 1;
    options.onChange(lease.slug);
    options.note(`initiator=borrow phase=returned slug=${lease.slug} reason=${reason}`);
  };
  const sweep = (): void => {
    for (const [code, pair] of pairs) if (pair.expires <= now()) pairs.delete(code);
    for (const lease of leases.values()) {
      if (
        lease.expires <= now() ||
        (lease.tab !== undefined && lease.heartbeat + HEARTBEAT_MS <= now())
      )
        remove(lease, 'expired-or-disconnected');
      else if (!options.enabled() || options.bot(lease.slug)?.browserAccess !== true)
        remove(lease, 'access-or-target-changed');
    }
  };
  const requireLease = (token: string, origin: string): Lease => {
    sweep();
    const lease = leases.get(token);
    if (lease === undefined || lease.origin !== origin)
      throw new Error('Borrowed tab is unavailable');
    allowed(lease.slug);
    return lease;
  };
  const active = (slug: string): Lease => {
    sweep();
    allowed(slug);
    const lease = [...leases.values()].find(
      (entry) => entry.slug === slug && entry.tab !== undefined,
    );
    if (lease === undefined)
      throw new Error(
        'No daily-browser tab is shared; ask the Human to share one through the extension',
      );
    return lease;
  };
  const timer = setInterval(sweep, 10_000);
  timer.unref();
  return {
    get revision() {
      return revision;
    },
    pair(slug) {
      allowed(slug);
      sweep();
      for (const [code, pair] of pairs) if (pair.slug === slug) pairs.delete(code);
      if (pairs.size >= 32) throw new Error('Too many pending Browser pairing requests');
      const code = randomBytes(16).toString('hex');
      const expiresAt = now() + PAIR_MS;
      pairs.set(code, { slug, expires: expiresAt });
      return { code, expiresAt };
    },
    redeem(code, origin) {
      if (!extensionOrigin(origin)) throw new Error('A Browser extension origin is required');
      sweep();
      const pair = pairs.get(code);
      if (pair === undefined) throw new Error('Pairing code expired or already used');
      allowed(pair.slug);
      if (leases.size >= 32) throw new Error('Too many Browser connections');
      pairs.delete(code);
      const token = randomBytes(32).toString('hex');
      const displayName = options.bot(pair.slug)!.displayName;
      leases.set(token, {
        token,
        slug: pair.slug,
        displayName,
        origin,
        expires: now() + PAIR_MS,
        tab: undefined,
        heartbeat: now(),
        pending: undefined,
        wake: undefined,
      });
      return { token, displayName };
    },
    share(token, origin, input) {
      const lease = requireLease(token, origin);
      if (lease.tab !== undefined) throw new Error('This connection already shared a tab');
      const data = object(input);
      const id = data.tabId;
      const url = text(data.url, 2048);
      const title = text(data.title, 500);
      if (
        !Number.isSafeInteger(id) ||
        typeof id !== 'number' ||
        id < 0 ||
        !/^https?:\/\//u.test(url)
      )
        throw new Error('Share an ordinary http(s) tab');
      for (const other of leases.values()) {
        if (other === lease) continue;
        if (other.tab?.id === id && other.origin === origin)
          throw new Error('This tab is already borrowed by another PersonaBot');
      }
      for (const other of [...leases.values()])
        if (other !== lease && other.slug === lease.slug) remove(other, 'replaced-by-Human');
      lease.tab = { id, url, title };
      lease.expires = now() + LEASE_MS;
      lease.heartbeat = now();
      revision += 1;
      options.onChange(lease.slug);
      options.note(`initiator=Human phase=borrowed slug=${lease.slug} mode=read-only`);
      return { url, title, expiresAt: lease.expires };
    },
    async poll(token, origin, signal) {
      const lease = requireLease(token, origin);
      if (lease.tab === undefined) throw new Error('Share the tab before observing');
      if (lease.wake !== undefined) throw new Error('A poll is already waiting');
      lease.heartbeat = now();
      if (lease.pending === undefined || lease.pending.delivered) {
        await new Promise<void>((resolve) => {
          const end = (): void => {
            clearTimeout(timeout);
            signal.removeEventListener('abort', end);
            if (lease.wake === end) lease.wake = undefined;
            resolve();
          };
          const timeout = setTimeout(end, 20_000);
          lease.wake = end;
          signal.addEventListener('abort', end, { once: true });
          if (signal.aborted) end();
        });
      }
      signal.throwIfAborted();
      requireLease(token, origin);
      const pending = lease.pending;
      if (pending === undefined || pending.delivered) return null;
      pending.delivered = true;
      return { id: pending.id, method: 'observe', tabId: lease.tab.id, url: lease.tab.url };
    },
    result(token, origin, input) {
      const lease = requireLease(token, origin);
      const data = object(input);
      const pending = lease.pending;
      if (pending === undefined || pending.id !== data.id || !pending.delivered)
        throw new Error('Observation request is no longer active');
      if (typeof data.error === 'string') {
        remove(lease, 'page-unavailable');
        return;
      }
      const reply = object(data.observation);
      const url = text(reply.url, 2048);
      if (url !== lease.tab?.url) {
        remove(lease, 'navigation');
        return;
      }
      const title = text(reply.title, 500);
      const body = text(reply.text, 40_000);
      if (!Array.isArray(reply.elements) || reply.elements.length > 80)
        throw new Error('Invalid extension controls');
      const elements = reply.elements.map((item) => {
        const element = object(item);
        return {
          ref: text(element.ref, 40),
          role: text(element.role, 80),
          name: text(element.name, 300),
        };
      });
      lease.pending = undefined;
      clearTimeout(pending.timer);
      pending.resolve({ url, title, text: body, elements });
    },
    returnToken(token, origin) {
      remove(requireLease(token, origin), 'Human-or-tab-change');
    },
    returnBot(slug) {
      for (const [code, pair] of pairs) if (pair.slug === slug) pairs.delete(code);
      for (const lease of [...leases.values()])
        if (lease.slug === slug) remove(lease, 'Human-or-access-change');
    },
    view(slug) {
      sweep();
      const lease = [...leases.values()].find(
        (entry) => entry.slug === slug && entry.tab !== undefined,
      );
      return lease?.tab === undefined
        ? undefined
        : { url: lease.tab.url, title: lease.tab.title, expiresAt: lease.expires };
    },
    async observe(slug, signal) {
      signal.throwIfAborted();
      const lease = active(slug);
      if (lease.pending !== undefined)
        throw new Error('A borrowed-tab observation is already pending');
      const observation = await new Promise<BrowserObservation>((resolve, reject) => {
        const id = randomBytes(12).toString('hex');
        const end = (): void => {
          if (lease.pending?.id === id) {
            clearTimeout(lease.pending.timer);
            lease.pending = undefined;
          }
        };
        const abort = (): void => {
          end();
          reject(new Error('Borrowed-tab observation cancelled'));
        };
        const finish = (value: BrowserObservation): void => {
          signal.removeEventListener('abort', abort);
          resolve(value);
        };
        const fail = (error: Error): void => {
          signal.removeEventListener('abort', abort);
          reject(error);
        };
        const timeout = setTimeout(() => {
          end();
          remove(lease, 'observation-timeout');
          fail(new Error('Daily Browser disconnected; share the tab again'));
        }, COMMAND_MS);
        lease.pending = { id, resolve: finish, reject: fail, timer: timeout, delivered: false };
        signal.addEventListener('abort', abort, { once: true });
        lease.wake?.();
      });
      signal.throwIfAborted();
      if (active(slug) !== lease) throw new Error('Borrowed tab changed during observation');
      return observation;
    },
    clear() {
      pairs.clear();
      for (const lease of [...leases.values()]) remove(lease, 'Host-or-target-change');
    },
    dispose() {
      disposed = true;
      clearInterval(timer);
      this.clear();
    },
  };
}
