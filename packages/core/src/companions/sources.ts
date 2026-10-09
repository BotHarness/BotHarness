export const companionSources = ['own-dm', 'bot-dm', 'shared-group', 'bot-group'] as const;
export type CompanionSource = (typeof companionSources)[number];
export type CompanionEpochs = Record<CompanionSource, number>;
export const companionMessageIdentity = (channelId: string, messageId: string): string =>
  JSON.stringify([channelId, messageId]);
export function companionSourceEnabled(
  source: unknown,
  selection: {
    dm: boolean;
    group?: boolean;
    visibility?: 'own-dm' | 'shared' | 'all-bot';
  },
): source is CompanionSource {
  return (
    (source === 'own-dm' ||
      source === 'bot-dm' ||
      source === 'shared-group' ||
      source === 'bot-group') &&
    (source === 'own-dm' || source === 'bot-dm' ? selection.dm : selection.group === true) &&
    (selection.visibility !== 'own-dm' || source === 'own-dm') &&
    (selection.visibility === 'all-bot' || (source !== 'bot-dm' && source !== 'bot-group'))
  );
}
