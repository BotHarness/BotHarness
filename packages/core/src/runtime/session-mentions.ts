import type { ChannelMention } from '../channels/channel.js';

export function sessionMentionText(body: string, mentions: readonly ChannelMention[]): string {
  let text = body;
  for (const mention of [...mentions].sort((a, b) => b.start - a.start)) {
    if (body.slice(mention.start, mention.end) !== '@' + mention.label) continue;
    text = text.slice(0, mention.start) + '\u2060' + text.slice(mention.start);
  }
  return text;
}
