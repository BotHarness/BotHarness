import { randomBytes } from 'node:crypto';

export const TAKEOVER_TTL_MS = 10 * 60_000;
export const TAKEOVER_MAX_INSTRUCTIONS = 2000;

export type TakeoverCompletion = 'done' | 'failed';
export type TakeoverState = 'pending' | 'accepted' | 'completed' | 'expired';

export interface TakeoverInputEvent {
  readonly at: number;
  readonly kind: 'mint' | 'accept' | 'input' | 'complete' | 'expire';
  readonly detail: string;
}

export interface TakeoverRecord {
  readonly token: string;
  readonly slug: string;
  readonly instructions: string;
  readonly expectedUrl: string | undefined;
  readonly createdAt: number;
  readonly expiresAt: number;
  state: TakeoverState;
  reason: TakeoverCompletion | 'expired' | undefined;
  completedAt: number | undefined;
  readonly events: TakeoverInputEvent[];
}

export function takeoverUrl(viewerUrl: string, token: string): string {
  return `${viewerUrl}${viewerUrl.includes('?') ? '&' : '?'}takeover=${encodeURIComponent(token)}`;
}

function mintToken(): string {
  return randomBytes(16).toString('hex');
}

export interface TakeoverService {
  mint(slug: string, instructions: string, expectedUrl?: string): TakeoverRecord;
  describe(token: string): TakeoverRecord | undefined;
  accept(token: string): TakeoverRecord | undefined;
  complete(token: string, reason: TakeoverCompletion): TakeoverRecord | undefined;
  wait(token: string, signal?: AbortSignal): Promise<TakeoverRecord>;
  recordInput(slug: string, detail: string): void;
  hasActive(slug: string): boolean;
  audit(slug: string): readonly TakeoverInputEvent[];
  recording(token: string): TakeoverRecord | undefined;
}

export function createTakeoverService(now: () => number = Date.now): TakeoverService {
  const records = new Map<string, TakeoverRecord>();
  const activeBySlug = new Map<string, string>();
  const waiters = new Map<string, Set<(record: TakeoverRecord) => void>>();

  const push = (record: TakeoverRecord, kind: TakeoverInputEvent['kind'], detail: string): void => {
    record.events.push({ at: now(), kind, detail });
  };

  const settle = (record: TakeoverRecord): void => {
    if (activeBySlug.get(record.slug) === record.token) activeBySlug.delete(record.slug);
    const pending = waiters.get(record.token);
    if (pending !== undefined) {
      waiters.delete(record.token);
      for (const wake of pending) wake(record);
    }
  };

  const refresh = (record: TakeoverRecord): TakeoverRecord => {
    if ((record.state === 'pending' || record.state === 'accepted') && now() >= record.expiresAt) {
      record.state = 'expired';
      record.reason = 'expired';
      record.completedAt = now();
      push(record, 'expire', `slug=${record.slug}`);
      settle(record);
    }
    return record;
  };

  return {
    mint(slug, instructions, expectedUrl) {
      const text = instructions.trim();
      if (text === '' || text.length > TAKEOVER_MAX_INSTRUCTIONS) {
        throw new Error('Takeover instructions must be 1-2000 characters');
      }
      const previous = activeBySlug.get(slug);
      if (previous !== undefined) {
        const old = records.get(previous);
        if (old !== undefined && (old.state === 'pending' || old.state === 'accepted')) {
          old.state = 'expired';
          old.reason = 'expired';
          old.completedAt = now();
          push(old, 'expire', `slug=${slug} superseded`);
          settle(old);
        }
      }
      const started = now();
      const record: TakeoverRecord = {
        token: mintToken(),
        slug,
        instructions: text,
        expectedUrl: expectedUrl?.trim() === '' ? undefined : expectedUrl?.trim(),
        createdAt: started,
        expiresAt: started + TAKEOVER_TTL_MS,
        state: 'pending',
        reason: undefined,
        completedAt: undefined,
        events: [],
      };
      push(record, 'mint', `slug=${slug} chars=${text.length}`);
      records.set(record.token, record);
      activeBySlug.set(slug, record.token);
      return record;
    },

    describe(token) {
      const record = records.get(token);
      return record === undefined ? undefined : refresh(record);
    },

    accept(token) {
      const record = records.get(token);
      if (record === undefined) return undefined;
      refresh(record);
      if (record.state !== 'pending') return record.state === 'accepted' ? record : undefined;
      record.state = 'accepted';
      push(record, 'accept', `slug=${record.slug}`);
      return record;
    },

    complete(token, reason) {
      const record = records.get(token);
      if (record === undefined) return undefined;
      refresh(record);
      if (record.state !== 'pending' && record.state !== 'accepted') return undefined;
      record.state = 'completed';
      record.reason = reason;
      record.completedAt = now();
      push(record, 'complete', `slug=${record.slug} reason=${reason}`);
      settle(record);
      return record;
    },

    wait(token, signal) {
      const record = records.get(token);
      if (record === undefined) return Promise.reject(new Error('Unknown takeover token'));
      refresh(record);
      if (record.state === 'completed' || record.state === 'expired') {
        return Promise.resolve(record);
      }
      return new Promise<TakeoverRecord>((resolve, reject) => {
        if (signal?.aborted === true) {
          reject(
            signal.reason instanceof Error ? signal.reason : new Error('Takeover wait aborted'),
          );
          return;
        }
        let timer: ReturnType<typeof setInterval> | undefined;
        const done = (next: TakeoverRecord): void => {
          if (timer !== undefined) clearInterval(timer);
          signal?.removeEventListener('abort', onAbort);
          resolve(refresh(next));
        };
        const onAbort = (): void => {
          if (timer !== undefined) clearInterval(timer);
          const pending = waiters.get(token);
          pending?.delete(done);
          reject(
            signal?.reason instanceof Error ? signal.reason : new Error('Takeover wait aborted'),
          );
        };
        let pending = waiters.get(token);
        if (pending === undefined) {
          pending = new Set();
          waiters.set(token, pending);
        }
        pending.add(done);
        signal?.addEventListener('abort', onAbort, { once: true });
        timer = setInterval(() => {
          const current = records.get(token);
          if (current === undefined) return;
          refresh(current);
          if (current.state === 'completed' || current.state === 'expired') {
            const awakened = waiters.get(token);
            if (awakened !== undefined) {
              waiters.delete(token);
              for (const wake of awakened) wake(current);
            }
          }
        }, 500);
      });
    },

    recordInput(slug, detail) {
      const token = activeBySlug.get(slug);
      if (token === undefined) return;
      const record = records.get(token);
      if (record === undefined) return;
      refresh(record);
      if (record.state !== 'pending' && record.state !== 'accepted') return;
      push(record, 'input', detail);
    },

    hasActive(slug) {
      const token = activeBySlug.get(slug);
      if (token === undefined) return false;
      const record = records.get(token);
      if (record === undefined) return false;
      refresh(record);
      return record.state === 'pending' || record.state === 'accepted';
    },

    audit(slug) {
      const events: TakeoverInputEvent[] = [];
      for (const record of records.values()) {
        if (record.slug !== slug) continue;
        refresh(record);
        events.push(...record.events);
      }
      return events.sort((a, b) => a.at - b.at);
    },

    recording(token) {
      const record = records.get(token);
      return record === undefined ? undefined : refresh(record);
    },
  };
}
