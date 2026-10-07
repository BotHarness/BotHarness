import {
  MessagingError,
  type MessagingProvider,
  type MessagingTypingLease,
  type MessagingTypingState,
} from './provider.js';

export interface MessagingProcessing {
  add(sourceEventIds: readonly string[]): void;
  stop(): Promise<void>;
}

export interface TypingCandidate {
  bindingId: string;
  grantId: string;
  providerId: string;
  token: object;
  provider: MessagingProvider;
  accountRef: string;
  fingerprint: string;
  route: Parameters<NonNullable<MessagingProvider['beginTyping']>>[0]['route'];
  signal: AbortSignal;
  validate(): boolean;
}

interface TypingEntry {
  candidate: TypingCandidate;
  controller: AbortController;
  signal: AbortSignal;
  lease?: MessagingTypingLease;
  work: Promise<void>;
  done?: Promise<void>;
  cleanup?: Promise<void>;
  stateToken: object;
  owners: number;
}

export function createMessagingTyping(options: {
  candidate(botSlug: string, sourceEventId: string): TypingCandidate | undefined;
  warn?(message: string): void;
  timeoutMs?: number;
}) {
  const live = new Set<TypingEntry>();
  const states = new Map<
    string,
    { token: object; state: MessagingTypingState | { phase: 'unavailable'; reason: string } }
  >();
  let closed = false;
  const bounded = async <T>(work: Promise<T>, duration: number): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new MessagingError('typing-timeout')), duration);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  const stopLease = (entry: TypingEntry): Promise<void> => {
    if (entry.cleanup) return entry.cleanup;
    if (!entry.lease) return Promise.resolve();
    entry.cleanup = bounded(entry.lease.stop(), 4_000);
    return entry.cleanup;
  };
  const stopEntry = (entry: TypingEntry): Promise<void> => {
    if (entry.done) return entry.done;
    entry.done = Promise.resolve().then(async () => {
      try {
        await bounded(entry.work, options.timeoutMs ?? 12_000);
        await stopLease(entry);
      } catch {
        if (states.get(entry.candidate.bindingId)?.token === entry.stateToken)
          states.set(entry.candidate.bindingId, {
            token: entry.stateToken,
            state: { phase: 'cleanup-unconfirmed', reason: 'cancelled' },
          });
      } finally {
        live.delete(entry);
      }
    });
    entry.controller.abort();
    return entry.done;
  };
  return {
    state(bindingId: string) {
      return states.get(bindingId)?.state ?? { phase: 'idle' as const };
    },
    invalidate(match: (candidate: TypingCandidate) => boolean) {
      for (const entry of live) if (match(entry.candidate)) void stopEntry(entry);
    },
    close() {
      closed = true;
      for (const entry of live) void stopEntry(entry);
    },
    begin(botSlug: string, sourceEventIds: readonly string[]): MessagingProcessing {
      let finished = false;
      const entries = new Map<string, TypingEntry>();
      const add = (ids: readonly string[]) => {
        if (closed || finished) return;
        for (const sourceEventId of ids) {
          let candidate: TypingCandidate | undefined;
          try {
            candidate = options.candidate(botSlug, sourceEventId);
          } catch {
            continue;
          }
          if (!candidate?.provider.beginTyping || entries.has(candidate.bindingId)) continue;
          const current = candidate;
          const existing = [...live].find(
            (entry) =>
              !entry.done &&
              !entry.signal.aborted &&
              entry.candidate.bindingId === current.bindingId &&
              entry.candidate.grantId === current.grantId &&
              entry.candidate.token === current.token,
          );
          if (existing) {
            existing.owners += 1;
            entries.set(current.bindingId, existing);
            continue;
          }
          const controller = new AbortController();
          const signal = AbortSignal.any([current.signal, controller.signal]);
          const stateToken = {};
          const entry: TypingEntry = {
            candidate: current,
            controller,
            signal,
            stateToken,
            work: Promise.resolve(),
            owners: 1,
          };
          entries.set(current.bindingId, entry);
          live.add(entry);
          const startedAt = Date.now();
          const notify = (
            state: MessagingTypingState | { phase: 'unavailable'; reason: string },
          ) => {
            if (states.get(current.bindingId)?.token !== stateToken) return;
            if (
              (closed || entry.owners === 0 || signal.aborted) &&
              (state.phase === 'accepted' || state.phase === 'requesting')
            )
              return;
            states.set(current.bindingId, { token: stateToken, state });
            try {
              options.warn?.(
                JSON.stringify({
                  event: 'messaging-typing',
                  initiator: 'inbox-processing',
                  botSlug,
                  sourceEventId,
                  bindingId: current.bindingId,
                  phase: state.phase,
                  durationMs: Date.now() - startedAt,
                  ...(state.reason ? { reason: state.reason } : {}),
                }),
              );
            } catch {}
          };
          states.set(current.bindingId, { token: stateToken, state: { phase: 'requesting' } });
          entry.work = Promise.resolve().then(async () => {
            try {
              signal.throwIfAborted();
              const request = current.provider.beginTyping!({
                accountRef: current.accountRef,
                fingerprint: current.fingerprint,
                route: current.route,
                signal,
                beforeSend() {
                  if (closed || entry.owners === 0 || signal.aborted) return false;
                  try {
                    return current.validate();
                  } catch {
                    return false;
                  }
                },
                onState: notify,
              });
              void request.then(
                (lease) => {
                  entry.lease = lease;
                  if (signal.aborted) void stopLease(entry).catch(() => undefined);
                },
                () => undefined,
              );
              entry.lease = await bounded(request, options.timeoutMs ?? 12_000);
            } catch {
              controller.abort();
              notify(
                signal.aborted && entry.owners === 0
                  ? { phase: 'idle', reason: 'cancelled' }
                  : { phase: 'unavailable', reason: 'typing-unavailable' },
              );
            }
          });
          signal.addEventListener(
            'abort',
            () => {
              void stopEntry(entry);
            },
            { once: true },
          );
          if (signal.aborted) void stopEntry(entry);
        }
      };
      add(sourceEventIds);
      return {
        add,
        async stop() {
          if (finished) return;
          finished = true;
          await Promise.allSettled(
            [...entries.values()].flatMap((entry) => {
              entry.owners -= 1;
              return entry.owners === 0 ? [stopEntry(entry)] : [];
            }),
          );
        },
      };
    },
  };
}
