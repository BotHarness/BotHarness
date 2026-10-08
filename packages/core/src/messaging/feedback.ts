import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { MessagingProviderError, type MessagingProvider } from './provider.js';

export type FeedbackKind = 'received' | 'answered';
export interface FeedbackAttempt {
  state: 'attempted' | 'accepted' | 'unavailable' | 'failed' | 'unknown';
  at: string;
  outboxId?: string;
}
export type SourceFeedback = Partial<Record<FeedbackKind, FeedbackAttempt>>;

interface FeedbackCandidate {
  provider: MessagingProvider;
  input: Omit<Parameters<NonNullable<MessagingProvider['react']>>[0], 'reaction' | 'signal'>;
  signal: AbortSignal;
}

export function createMessagingFeedback(options: {
  database: OperationalDatabaseModulePort;
  candidate(botSlug: string, sourceEventId: string): FeedbackCandidate | undefined;
  warn?(message: string): void;
}) {
  const controller = new AbortController();
  let pending = 0;
  const stamp = (
    botSlug: string,
    sourceEventId: string,
    kind: FeedbackKind,
    state: FeedbackAttempt['state'],
    outboxId?: string,
  ): boolean =>
    options.database.transaction(
      (db) => {
        const row = db
          .prepare(`SELECT s.payload_json FROM source_events s
      JOIN inbox_admissions a USING(source_event_id)
      WHERE s.source_event_id = ? AND a.bot_slug = ? AND s.source_kind = 'bridge-message'`)
          .get(sourceEventId, botSlug) as { payload_json: string } | undefined;
        if (!row) return false;
        if (
          kind === 'answered' &&
          !db
            .prepare(`SELECT 1 FROM messaging_outbox
      WHERE id = ? AND bot_slug = ? AND state = 'provider-accepted'
        AND json_extract(body, '$.sourceEventId') = ?`)
            .get(outboxId ?? '', botSlug, sourceEventId)
        )
          return false;
        const payload = JSON.parse(row.payload_json) as { feedback?: SourceFeedback };
        const previous = payload.feedback?.[kind];
        if (state === 'attempted' && previous) return false;
        if (state !== 'attempted' && previous?.state !== 'attempted') return false;
        payload.feedback = {
          ...payload.feedback,
          [kind]: {
            state,
            at: new Date().toISOString(),
            ...(outboxId ? { outboxId } : {}),
          },
        };
        db.prepare('UPDATE source_events SET payload_json = ? WHERE source_event_id = ?').run(
          JSON.stringify(payload),
          sourceEventId,
        );
        return true;
      },
      ['messaging-feedback'],
    );
  return {
    close() {
      controller.abort();
    },
    notify(botSlug: string, sourceEventId: string, kind: FeedbackKind, outboxId?: string) {
      if (controller.signal.aborted || pending >= 32) return;
      let candidate: FeedbackCandidate | undefined;
      try {
        candidate = options.candidate(botSlug, sourceEventId);
        if (!candidate || !stamp(botSlug, sourceEventId, kind, 'attempted', outboxId)) return;
      } catch {
        return;
      }
      const current = candidate;
      pending++;
      const beganAt = Date.now();
      void (async () => {
        let state: FeedbackAttempt['state'] = 'unknown';
        const timeout = new AbortController();
        const signal = AbortSignal.any([controller.signal, current.signal, timeout.signal]);
        let timer: ReturnType<typeof setTimeout> | undefined;
        let callStarted = false;
        try {
          if (!current.provider.react) {
            state = 'unavailable';
            return;
          }
          const operation = current.provider
            .react({
              ...current.input,
              reaction: kind,
              signal,
              beforeSend: () => !signal.aborted && current.input.beforeSend(),
            })
            .finally(() => {
              pending--;
            });
          callStarted = true;
          const result = await Promise.race([
            operation,
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                timeout.abort();
                reject(new Error('feedback-timeout'));
              }, 4_000);
            }),
          ]);
          if (result?.accepted === true) state = 'accepted';
        } catch (error) {
          if (error instanceof MessagingProviderError && error.disposition === 'not-started')
            state = error.code === 'capability-unavailable' ? 'unavailable' : 'failed';
        } finally {
          if (timer) clearTimeout(timer);
          if (!callStarted) pending--;
          try {
            stamp(botSlug, sourceEventId, kind, state, outboxId);
            options.warn?.(
              JSON.stringify({
                event: 'messaging-feedback',
                initiator: kind === 'received' ? 'inbox-admission' : 'outbox-accepted',
                sourceEventId,
                botSlug,
                kind,
                phase: state,
                durationMs: Date.now() - beganAt,
              }),
            );
          } catch {}
        }
      })();
    },
  };
}
