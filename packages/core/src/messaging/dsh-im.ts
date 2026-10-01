import { createHash } from 'node:crypto';
import { z } from 'zod';
import type {
  MessagingAttachment,
  MessagingInboundEvent,
  MessagingReplyRoute,
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
  fileVersion?: 1;
  readSourceFile?(
    botId: string,
    route: MessagingReplyRoute,
    attachment: MessagingAttachment,
    options: { expectedFingerprint: string; signal: AbortSignal },
  ): Promise<AsyncIterable<Uint8Array>>;
  replyFileChecked?(
    botId: string,
    route: MessagingReplyRoute,
    file: { id: string; name: string; bytes: Uint8Array },
    options: { expectedFingerprint: string; signal: AbortSignal },
  ): Promise<{ sent: true }>;

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
      sourceFiles?: boolean;
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
    attachments: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-f0-9]{64}$/),
            messageId: identifier,
            resourceKey: identifier,
            name: identifier,
          })
          .strict(),
      )
      .max(1)
      .optional(),
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
    'file-upload-failed',
    'file-provider-rejected',
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
              ...(host.fileVersion === 1 &&
              info.capabilities.includes('source-file-checked') &&
              info.capabilities.includes('reply-file-checked')
                ? { sourceFiles: true }
                : {}),
              onEvent: async (raw, context) => {
                const parsed = inboundSchema.parse(raw);
                const { threadId, rootId, parentId, ...required } = parsed.reply;
                const { attachments, ...base } = parsed;
                const event: MessagingInboundEvent = {
                  ...base,
                  ...(attachments === undefined ? {} : { attachments }),
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
                  event.reply.actorId !== event.actor.id ||
                  event.attachments?.some((item) => item.messageId !== event.reply.parentId)
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
    ...(host.fileVersion === 1 &&
    typeof host.readSourceFile === 'function' &&
    typeof host.replyFileChecked === 'function'
      ? {
          async readFile(input: Parameters<NonNullable<MessagingProvider['readFile']>>[0]) {
            const info = await host.describeBot(input.accountRef);
            if (
              info.account.fingerprint !== input.fingerprint ||
              !info.capabilities.includes('source-file-checked')
            )
              throw new MessagingError('provider-incompatible');
            return host.readSourceFile!(input.accountRef, input.route, input.attachment, {
              expectedFingerprint: input.fingerprint,
              signal: input.signal,
            });
          },
          async replyFile(input: Parameters<NonNullable<MessagingProvider['replyFile']>>[0]) {
            try {
              const info = await host.describeBot(input.accountRef);
              if (
                info.account.fingerprint !== input.fingerprint ||
                !info.capabilities.includes('reply-file-checked')
              )
                throw new MessagingProviderError('capability-unavailable', 'not-started');
              const result = await host.replyFileChecked!(
                input.accountRef,
                input.route,
                input.file,
                {
                  expectedFingerprint: input.fingerprint,
                  signal: input.signal,
                },
              );
              if (result.sent !== true)
                throw new MessagingProviderError('provider-result-unknown', 'unknown');
              return { accepted: true as const };
            } catch (error) {
              throw providerFailure(error);
            }
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
