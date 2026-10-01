import { createHash } from 'node:crypto';
import { z } from 'zod';
import type {
  MessagingInboundEvent,
  MessagingReplyRoute,
  MessagingHistoryQuery,
  MessagingHistoryPage,
} from './provider.js';
import { MessagingError, MessagingProviderError, type MessagingProvider } from './provider.js';

interface DshImTarget {
  targetId: string;
  name?: string;
  kind: string;
  route: Record<string, string | number>;
}

export interface DshImOutboundService {
  contractVersion: 1;
  listBots(): Promise<{ botId: string; channel: string }[]>;
  listTargets(botId: string): Promise<DshImTarget[]>;
  describeBot(botId: string): Promise<{
    version: 1;
    channel: string;
    botId: string;
    account: { fingerprint: string; name?: string };
    connected: boolean;
    capabilities: string[];
  }>;
  consumeInbound?(
    botId: string,
    options: {
      expectedFingerprint: string;
      signal: AbortSignal;
      onEvent(event: unknown, context: { signal: AbortSignal }): Promise<{ accepted: true }>;
    },
  ): Promise<() => void>;
  replyChecked?(
    botId: string,
    route: MessagingReplyRoute,
    text: string,
    options: {
      expectedFingerprint: string;
      signal: AbortSignal;
    },
  ): Promise<{ sent: true }>;
  historyChecked?(
    botId: string,
    route: MessagingReplyRoute,
    query: MessagingHistoryQuery,
    options: { expectedFingerprint: string; signal: AbortSignal },
  ): Promise<MessagingHistoryPage>;
  sendChecked(
    botId: string,
    targetId: string,
    text: string,
    options: {
      expectedFingerprint: string;
      expectedTargetDigest: string;
      signal: AbortSignal;
      format: 'plain';
    },
  ): Promise<{ sent: true }>;
}

function targetDigest(target: DshImTarget): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        kind: target.kind,
        route: Object.fromEntries(
          Object.entries(target.route).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        ),
      }),
    )
    .digest('hex');
}

const identifier = z.string().min(1).max(512);
const inboundSchema = z
  .object({
    version: z.literal(1),
    channel: z.literal('feishu'),
    botId: identifier,
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    eventId: identifier,
    messageId: identifier,
    actor: z.object({ kind: z.literal('user'), id: identifier }).strict(),
    conversation: z.object({ kind: z.enum(['group', 'dm']), id: identifier }).strict(),
    mentions: z.array(z.object({ id: identifier, key: identifier }).strict()).max(100),
    mentionedAccount: z.boolean(),
    at: z.iso.datetime(),
    text: z.string().min(1).max(16000),
    reply: z
      .object({
        messageId: identifier,
        conversationId: identifier,
        actorId: identifier,
        threadId: identifier.optional(),
        rootId: identifier.optional(),
        parentId: identifier.optional(),
      })
      .strict(),
    replay: z
      .object({
        kind: z.literal('provider-redelivery'),
        resumeCursor: z.literal(false),
        gapPossible: z.literal(true),
      })
      .strict(),
  })
  .strict();

function providerFailure(error: unknown): MessagingProviderError {
  if (error instanceof MessagingProviderError) return error;
  const code =
    error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'provider-result-unknown';
  const definite = [
    'unknown-bot',
    'unknown-target',
    'account-changed',
    'account-unverified',
    'target-changed',
    'capability-unavailable',
    'bot-not-connected',
    'bad-request',
    'stale-route',
    'consumer-unavailable',
  ].includes(code);
  return new MessagingProviderError(
    definite ? code : 'provider-result-unknown',
    definite ? 'not-started' : 'unknown',
  );
}

export function createDshImProvider(value: unknown): MessagingProvider | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const service = value as Partial<DshImOutboundService>;
  if (
    service.contractVersion !== 1 ||
    typeof service.describeBot !== 'function' ||
    typeof service.sendChecked !== 'function' ||
    typeof service.listBots !== 'function' ||
    typeof service.listTargets !== 'function'
  )
    return undefined;
  const host = service as DshImOutboundService;
  const account = async (ref: string) => {
    let info;
    try {
      info = await host.describeBot(ref);
    } catch (error) {
      const code =
        error !== null && typeof error === 'object' && 'code' in error ? error.code : undefined;
      throw new MessagingError(
        code === 'account-changed' ? 'rebind-required' : 'provider-unavailable',
      );
    }
    if (
      info.version !== 1 ||
      info.botId !== ref ||
      info.channel !== 'feishu' ||
      !/^[a-f0-9]{64}$/.test(info.account?.fingerprint ?? '') ||
      !info.capabilities.includes('proactive-text-checked')
    )
      throw new MessagingError('provider-incompatible');
    return {
      ref,
      platform: info.channel,
      name: info.account.name ?? ref,
      fingerprint: info.account.fingerprint,
      connected: info.connected,
    };
  };
  const targets = async (ref: string) =>
    (await host.listTargets(ref)).map((target) => ({
      ref: target.targetId,
      name: target.name ?? target.targetId,
      digest: targetDigest(target),
      ...(target.kind === 'group' && typeof target.route.chatId === 'string'
        ? { receiveScope: { kind: 'group' as const, conversationId: target.route.chatId } }
        : {}),
    }));
  return {
    id: 'dsh-im/feishu',
    async accounts() {
      const bots = (await host.listBots()).filter((bot) => bot.channel === 'feishu');
      const result = await Promise.allSettled(bots.map((bot) => account(bot.botId)));
      return result.flatMap((item) => (item.status === 'fulfilled' ? [item.value] : []));
    },
    targets,
    async inspect(accountRef, targetRef) {
      const current = await account(accountRef);
      const target = (await targets(accountRef)).find((item) => item.ref === targetRef);
      if (target === undefined) throw new MessagingError('provider-unavailable');
      return { account: current, target };
    },
    ...(typeof host.consumeInbound === 'function' && typeof host.replyChecked === 'function'
      ? {
          async consume(input: Parameters<NonNullable<MessagingProvider['consume']>>[0]) {
            const info = await host.describeBot(input.accountRef);
            if (
              info.account.fingerprint !== input.fingerprint ||
              !info.capabilities.includes('exclusive-text-consumer') ||
              !info.capabilities.includes('reply-text-checked')
            )
              throw new MessagingError('provider-incompatible');
            return host.consumeInbound!(input.accountRef, {
              expectedFingerprint: input.fingerprint,
              signal: input.signal,
              onEvent: async (raw, context) => {
                const parsed = inboundSchema.parse(raw);
                const { threadId, rootId, parentId, ...required } = parsed.reply;
                const event: MessagingInboundEvent = {
                  ...parsed,
                  reply: {
                    ...required,
                    ...(threadId === undefined ? {} : { threadId }),
                    ...(rootId === undefined ? {} : { rootId }),
                    ...(parentId === undefined ? {} : { parentId }),
                  },
                };
                context.signal.throwIfAborted();
                if (
                  event.botId !== input.accountRef ||
                  event.fingerprint !== input.fingerprint ||
                  event.reply.messageId !== event.messageId ||
                  event.reply.conversationId !== event.conversation.id ||
                  event.reply.actorId !== event.actor.id
                )
                  throw new MessagingError('untrusted-source');
                return input.onEvent(event, context.signal);
              },
            });
          },
          async reply(input: Parameters<NonNullable<MessagingProvider['reply']>>[0]) {
            try {
              const result = await host.replyChecked!(input.accountRef, input.route, input.text, {
                expectedFingerprint: input.fingerprint,
                signal: input.signal,
              });
              if (result.sent !== true)
                throw new MessagingProviderError('provider-result-unknown', 'unknown');
              return { accepted: true as const };
            } catch (error) {
              throw providerFailure(error);
            }
          },
        }
      : {}),
    ...(typeof host.historyChecked === 'function'
      ? {
          async history(input: Parameters<NonNullable<MessagingProvider['history']>>[0]) {
            input.signal.throwIfAborted();
            const info = await host.describeBot(input.accountRef);
            if (info.account.fingerprint !== input.fingerprint)
              throw new MessagingError('rebind-required');
            if (
              !info.capabilities.includes('history-text-checked') ||
              (input.query.scope === 'thread' &&
                !info.capabilities.includes('thread-history-text-checked'))
            )
              throw new MessagingError('history-capability-unavailable');
            let raw;
            try {
              raw = await host.historyChecked!(input.accountRef, input.route, input.query, {
                expectedFingerprint: input.fingerprint,
                signal: input.signal,
              });
            } catch (error) {
              const code =
                error !== null && typeof error === 'object' && 'code' in error
                  ? error.code
                  : undefined;
              throw new MessagingError(
                typeof code === 'string' &&
                  [
                    'history-permission-denied',
                    'history-unavailable',
                    'thread-unavailable',
                    'stale-route',
                    'account-changed',
                    'capability-unavailable',
                    'cancelled',
                  ].includes(code)
                  ? code
                  : 'history-unavailable',
              );
            }
            input.signal.throwIfAborted();
            const parsed = z
              .object({
                version: z.literal(1),
                scope: z.enum(['group', 'nearby', 'thread']),
                events: z.array(inboundSchema).max(20),
                omitted: z.number().int().min(0).max(20),
                hasMore: z.boolean(),
                nextCursor: z.string().min(1).max(4096).optional(),
                window: z
                  .object({ start: z.number().int(), end: z.number().int() })
                  .strict()
                  .optional(),
                coverage: z.literal('provider-visible-human-text'),
              })
              .strict()
              .parse(raw);
            if (
              parsed.scope !== input.query.scope ||
              parsed.events.length + parsed.omitted > input.query.limit ||
              parsed.hasMore !== (parsed.nextCursor !== undefined)
            )
              throw new MessagingError('untrusted-source');
            for (const event of parsed.events) {
              if (
                event.botId !== input.accountRef ||
                event.fingerprint !== input.fingerprint ||
                event.conversation.kind !== 'group' ||
                event.conversation.id !== input.route.conversationId ||
                event.reply.conversationId !== event.conversation.id ||
                event.reply.messageId !== event.messageId ||
                event.reply.actorId !== event.actor.id ||
                (input.query.scope === 'thread' && event.reply.threadId !== input.route.threadId)
              )
                throw new MessagingError('untrusted-source');
            }
            return parsed as MessagingHistoryPage;
          },
        }
      : {}),
    async send(input) {
      try {
        const result = await host.sendChecked(input.accountRef, input.targetRef, input.text, {
          expectedFingerprint: input.fingerprint,
          expectedTargetDigest: input.targetDigest,
          signal: input.signal,
          format: 'plain',
        });
        if (result.sent !== true)
          throw new MessagingProviderError('provider-result-unknown', 'unknown');
        return { accepted: true };
      } catch (error) {
        throw providerFailure(error);
      }
    },
  };
}
