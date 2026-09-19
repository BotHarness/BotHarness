import {
  createGroupChannel,
  errorMessage,
  loadBots,
  loadChannelMessages,
  loadChannels,
  loadSessions,
  openDmChannel,
  sendChannelMessage,
  type BridgeCall,
} from './bridge.js';
import type {
  ChannelSummary,
  ClientStore,
  ConversationSelection,
  SessionSummary,
} from './store.js';

export interface BridgeActions {
  load(signal?: AbortSignal): Promise<void>;
  openBot(slug: string): Promise<void>;
  openChannel(channelId: string): Promise<void>;
  send(body: string): Promise<boolean>;
  createGroup(name: string): Promise<ChannelSummary | undefined>;
}

export function createActions(call: BridgeCall, clientStore: ClientStore): BridgeActions {
  const currentSelection = (): ConversationSelection | undefined =>
    clientStore.getSnapshot().selection;

  const loadSessionsFor = async (slug: string, selection: ConversationSelection): Promise<void> => {
    clientStore.setSessions({ status: 'loading', items: [], error: undefined });
    try {
      const items: readonly SessionSummary[] = await loadSessions(call, slug);
      if (currentSelection() !== selection) return;
      clientStore.setSessions({ status: 'ready', items, error: undefined });
    } catch (error) {
      if (currentSelection() !== selection) return;
      clientStore.setSessions({ status: 'error', items: [], error: errorMessage(error) });
    }
  };

  const openChannelById = async (channelId: string): Promise<void> => {
    const snapshot = clientStore.getSnapshot();
    const channel = snapshot.channels.find((candidate) => candidate.id === channelId);
    if (channel === undefined) return;
    const selection: ConversationSelection = { kind: 'channel', channelId };
    clientStore.select(selection);
    clientStore.setConversation({
      status: 'loading',
      channel,
      messages: [],
      error: undefined,
      sending: false,
    });
    try {
      const messages = await loadChannelMessages(call, channelId);
      if (currentSelection() !== selection) return;
      clientStore.setConversation({
        status: 'ready',
        channel,
        messages,
        error: undefined,
        sending: false,
      });
    } catch (error) {
      if (currentSelection() !== selection) return;
      clientStore.setConversation({ status: 'error', error: errorMessage(error), sending: false });
    }
  };

  return {
    async load(signal) {
      clientStore.setRosterStatus('loading', undefined);
      try {
        const [bots, channels] = await Promise.all([
          loadBots(call, signal),
          loadChannels(call, signal),
        ]);
        if (signal?.aborted === true) return;
        clientStore.setRoster(bots, channels);
      } catch (error) {
        if (signal?.aborted === true) return;
        clientStore.setRosterStatus('error', errorMessage(error));
      }
    },
    async openBot(slug) {
      const snapshot = clientStore.getSnapshot();
      const bot = snapshot.bots.find((candidate) => candidate.slug === slug);
      if (bot === undefined) return;
      const selection: ConversationSelection = { kind: 'bot', slug };
      clientStore.select(selection);
      clientStore.setConversation({
        status: 'loading',
        channel: undefined,
        messages: [],
        error: undefined,
        sending: false,
      });
      try {
        const channel = await openDmChannel(call, slug, bot.displayName);
        const messages = await loadChannelMessages(call, channel.id);
        if (currentSelection() !== selection) return;
        clientStore.upsertChannel(channel);
        clientStore.setConversation({
          status: 'ready',
          channel,
          messages,
          error: undefined,
          sending: false,
        });
      } catch (error) {
        if (currentSelection() !== selection) return;
        clientStore.setConversation({
          status: 'error',
          error: errorMessage(error),
          sending: false,
        });
      }
      await loadSessionsFor(slug, selection);
    },
    openChannel(channelId) {
      return openChannelById(channelId);
    },
    async send(body) {
      const snapshot = clientStore.getSnapshot();
      const channel = snapshot.conversation.channel;
      const text = body.trim();
      if (channel === undefined || text.length === 0 || snapshot.conversation.sending) return false;
      clientStore.setConversation({ sending: true, error: undefined });
      try {
        const message = await sendChannelMessage(call, channel.id, text);
        const latest = clientStore.getSnapshot().conversation;
        if (latest.channel?.id !== channel.id) return false;
        // The host writes the channel's updatedAt on append; mirror it so
        // recency sorting re-renders without a reload.
        clientStore.upsertChannel({ ...channel, updatedAt: message.at });
        clientStore.setConversation({
          sending: false,
          messages: [...latest.messages, message],
        });
        return true;
      } catch (error) {
        if (clientStore.getSnapshot().conversation.channel?.id === channel.id) {
          clientStore.setConversation({ sending: false, error: errorMessage(error) });
        }
        return false;
      }
    },
    async createGroup(name) {
      const channel = await createGroupChannel(call, name);
      clientStore.upsertChannel(channel);
      await openChannelById(channel.id);
      return channel;
    },
  };
}
