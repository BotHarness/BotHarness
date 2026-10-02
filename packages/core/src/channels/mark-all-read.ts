import { isBotDmChannel, LOCAL_HUMAN_ID } from './channel.js';
import type { ChannelStore } from './store.js';

export async function markAllHumanMessagesRead(store: ChannelStore): Promise<{ channels: number }> {
  const visible = (id: string): boolean => {
    const channel = store.get(id);
    return (
      channel !== undefined &&
      channel.deletedAt === undefined &&
      !isBotDmChannel(channel) &&
      (channel.type === 'dm' ||
        store.listHumanMembers(id).some((member) => member.humanId === LOCAL_HUMAN_ID))
    );
  };
  const heads = store
    .list()
    .filter((channel) => visible(channel.id))
    .flatMap((channel) => {
      const message = store.readHumanTimeline(channel.id, { limit: 1 })?.entries.at(-1);
      return message === undefined ? [] : [{ channelId: channel.id, messageId: message.id }];
    });
  let channels = 0;
  for (const head of heads) {
    if (!visible(head.channelId)) continue;
    if (await store.markRead(head.channelId, head.messageId)) channels++;
  }
  return { channels };
}
