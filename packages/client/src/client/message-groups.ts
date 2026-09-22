import type { ChannelMessage } from './store.js';

export interface MessageGroup {
  key: string;
  messages: ChannelMessage[];
}

/**
 * A compact visual group: same concrete sender, same day, short gap, bounded
 * span/count. The durable Channel log remains one message per entry.
 */
export function groupChannelMessages(messages: readonly ChannelMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const message of messages) {
    const last = groups.at(-1);
    const first = last?.messages[0];
    const previous = last?.messages.at(-1);
    const firstAt = first === undefined ? NaN : Date.parse(first.at);
    const previousAt = previous === undefined ? NaN : Date.parse(previous.at);
    const at = Date.parse(message.at);
    const sameAuthor =
      previous !== undefined &&
      previous.author.kind === message.author.kind &&
      (message.author.kind === 'human' ||
        (message.author.kind === 'bot' &&
          previous.author.kind === 'bot' &&
          previous.author.slug === message.author.slug) ||
        (message.author.kind === 'bridged' &&
          previous.author.kind === 'bridged' &&
          previous.author.source === message.author.source));
    const sameDay =
      Number.isFinite(at) &&
      Number.isFinite(previousAt) &&
      new Date(at).toDateString() === new Date(previousAt).toDateString();
    if (
      last !== undefined &&
      sameAuthor &&
      sameDay &&
      last.messages.length < 8 &&
      at - previousAt >= 0 &&
      at - previousAt <= 15_000 &&
      at - firstAt <= 180_000
    ) {
      last.messages.push(message);
    } else {
      groups.push({ key: message.id, messages: [message] });
    }
  }
  return groups;
}
