import type { Context } from '@deepseek-ai/cordis';
import type { ChannelMessageCommit } from './store.js';
import type { SessionOwnership } from '../sessions/ownership.js';

export const PERSONABOT_OUTPUT_COMMITTED = 'botharness/personabot/output-committed';

export interface PersonaBotOutputCommitted {
  readonly version: 1;
  readonly botId: string;
  readonly sessionId: string;
  readonly channelId: string;
  readonly messageId: string;
  readonly channelRevision: number;
  readonly at: string;
  readonly content: Readonly<{ body: string; format: 'markdown' | 'text' }>;
  readonly correlation: Readonly<{
    sourceEventId?: string;
    replyToMessageId?: string;
    rootSourceEventId?: string;
    parentSourceEventId?: string;
  }>;
}

export function personaBotOutputCommitted(
  commit: ChannelMessageCommit,
  ownership: Pick<SessionOwnership, 'resolve'>,
): PersonaBotOutputCommitted | undefined {
  const { message, origin } = commit;
  if (message.author.kind !== 'bot' || origin === undefined) return undefined;
  const owner = ownership.resolve(origin.sessionId);
  if (owner?.botSlug !== message.author.slug) return undefined;
  return Object.freeze({
    version: 1,
    botId: message.author.slug,
    sessionId: origin.sessionId,
    channelId: commit.channelId,
    messageId: message.id,
    channelRevision: commit.revision,
    at: message.at,
    content: Object.freeze({ body: message.body, format: message.format ?? 'markdown' }),
    correlation: Object.freeze({
      ...(origin.sourceEventId === undefined ? {} : { sourceEventId: origin.sourceEventId }),
      ...(message.replyTo === undefined ? {} : { replyToMessageId: message.replyTo }),
      ...(message.botCausation === undefined
        ? {}
        : {
            rootSourceEventId: message.botCausation.rootSourceEventId,
            parentSourceEventId: message.botCausation.parentSourceEventId,
          }),
    }),
  });
}

export function emitPersonaBotOutputCommitted(
  ctx: Context,
  event: PersonaBotOutputCommitted,
  warn: (message: string) => void,
): void {
  try {
    ctx.fiber.assertActive();
  } catch {
    return;
  }
  for (const listener of ctx.events.dispatch('emit', [PERSONABOT_OUTPUT_COMMITTED])) {
    try {
      void Promise.resolve(listener(event)).catch(() => warn('personabot-output-consumer-failed'));
    } catch {
      warn('personabot-output-consumer-failed');
    }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    'botharness/personabot/output-committed'(event: PersonaBotOutputCommitted): void;
  }
}
