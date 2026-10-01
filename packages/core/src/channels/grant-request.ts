import type { ChannelMessage, ChannelRecord } from './channel.js';
import { ChannelReplyTargetError } from './store.js';

export function isGrantRequestResolved(
  messages: readonly ChannelMessage[],
  requestMessageId: string,
): boolean {
  return messages.some(
    (message) =>
      message.author.kind === 'human' &&
      message.replyTo === requestMessageId &&
      message.grantRequestResolution?.requestMessageId === requestMessageId,
  );
}

export function assertGrantRequestReply(
  channel: ChannelRecord,
  message: ChannelMessage,
  messages: readonly ChannelMessage[],
): void {
  const resolution = message.grantRequestResolution;
  if (resolution === undefined) return;
  const request = messages.find((entry) => entry.id === resolution.requestMessageId);
  if (
    channel.type !== 'dm' ||
    channel.botSlug === undefined ||
    message.author.kind !== 'human' ||
    message.replyTo !== resolution.requestMessageId ||
    request?.grantRequest !== true ||
    request.author.kind !== 'bot' ||
    request.author.slug !== channel.botSlug ||
    isGrantRequestResolved(messages, request.id)
  )
    throw new ChannelReplyTargetError();
}
