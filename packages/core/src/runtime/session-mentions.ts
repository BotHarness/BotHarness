import type { ChannelMention } from '../channels/channel.js';

/**
 * DSH's native Session prose treats a bare @word as a file reference. A
 * word-joiner before a selected PersonaBot @ keeps the visible text intact
 * without turning it into a clickable file. The Channel message stays
 * canonical; this only formats the Agent Session copy.
 */
export function sessionMentionText(body: string, mentions: readonly ChannelMention[]): string {
  let text = body;
  for (const mention of [...mentions].sort((a, b) => b.start - a.start)) {
    if (body.slice(mention.start, mention.end) !== '@' + mention.label) continue;
    text = text.slice(0, mention.start) + '\u2060' + text.slice(mention.start);
  }
  return text;
}
