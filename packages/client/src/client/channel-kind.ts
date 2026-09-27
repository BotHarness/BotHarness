import type { ChannelSummary } from './store.js';

export function isHumanReadOnlyDmChannel(channel: ChannelSummary | undefined): boolean {
  return channel?.type === 'dm' && channel.botSlug === undefined;
}

export function isBotDmChannel(channel: ChannelSummary | undefined): boolean {
  return channel?.type === 'dm' && channel.botSlug === undefined && channel.members.length === 2;
}
