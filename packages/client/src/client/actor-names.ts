import type { BotSummary, ChannelHumanMember, ChannelMessage, ChannelSummary } from './store.js';

export function channelHumanName(
  channel: Pick<ChannelSummary, 'humanMembers'> | undefined,
): string {
  return (
    channel?.humanMembers?.find((member) => member.humanId === 'local-human')?.displayName ??
    'Human'
  );
}

export function currentMentionLabel(
  mention:
    | NonNullable<ChannelMessage['mentions']>[number]
    | NonNullable<ChannelMessage['humanMentions']>[number],
  bots: readonly BotSummary[],
  humans: readonly ChannelHumanMember[],
): string {
  return 'humanId' in mention
    ? (humans.find((member) => member.humanId === mention.humanId)?.displayName ?? mention.label)
    : (bots.find((bot) => bot.slug === mention.botSlug)?.displayName ?? mention.label);
}
