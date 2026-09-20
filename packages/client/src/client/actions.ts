import {
  assignRosterChannel,
  BridgeCallError,
  createGroupChannel,
  createRosterSection,
  errorMessage,
  loadBots,
  loadChannelMessages,
  loadChannels,
  loadRoster,
  loadSessions,
  openDmChannel,
  removeRosterSection,
  renameRosterSection,
  reorderRosterSections,
  reorderTopOrder,
  sendChannelMessage,
  type BridgeCall,
} from './bridge.js';
import { planSectionChannelOrder, type RosterSection, type TopOrderEntry } from './roster.js';
import { completeFlatEntries } from './roster-order.js';
import type {
  ChannelSummary,
  ClientStore,
  ConversationSelection,
  SessionSummary,
} from './store.js';

export interface BridgeActions {
  load(signal?: AbortSignal): Promise<void>;
  refreshRoster(signal?: AbortSignal): Promise<void>;
  openBot(slug: string): Promise<void>;
  openChannel(channelId: string): Promise<void>;
  send(body: string): Promise<boolean>;
  createGroup(name: string): Promise<ChannelSummary | undefined>;
  createSection(name: string): Promise<RosterSection | undefined>;
  renameSection(sectionId: string, name: string): Promise<boolean>;
  removeSection(sectionId: string): Promise<boolean>;
  assignChannel(channelId: string, sectionId: string | undefined, index?: number): Promise<boolean>;
  /** Freeze a section's channel order through positioned channelAssign writes. */
  setSectionChannelOrder(sectionId: string, order: readonly string[]): Promise<boolean>;
  /**
   * Move a Channel into a section, writing the full target order positionally
   * so the frozen order matches the drop. The moved Channel is one of those
   * writes, which is also the single ownership transfer.
   */
  moveChannel(channelId: string, sectionId: string, order: readonly string[]): Promise<boolean>;
  /** Replace the section display order. */
  reorderSections(order: readonly string[]): Promise<boolean>;
  /** Replace the flat top-level order outright (loose placements, migration). */
  reorderFlat(order: readonly TopOrderEntry[]): Promise<boolean>;
  /**
   * Move a Channel out of its section into a loose flat slot: unassign first
   * (single ownership; the host appends the loose entry), then position the
   * absolute flat order. No scope mode changes.
   */
  moveToFlat(channelId: string, order: readonly TopOrderEntry[]): Promise<boolean>;
  /**
   * Convert a pre-flat host arrangement once: sections in snapshot order,
   * then every unsectioned channel loose at the end. Skips when the host
   * already carries a flat order, is read-only, or holds nothing to convert.
   */
  ensureFlatTopOrder(): Promise<boolean>;
}

export function createActions(call: BridgeCall, clientStore: ClientStore): BridgeActions {
  const currentSelection = (): ConversationSelection | undefined =>
    clientStore.getSnapshot().selection;

  const refreshRoster = async (signal?: AbortSignal): Promise<void> => {
    try {
      const snapshot = await loadRoster(call, signal);
      if (signal?.aborted === true) return;
      clientStore.setRosterState({
        pins: snapshot.pins,
        sections: snapshot.sections,
        topOrder: snapshot.topOrder,
        readOnly: false,
      });
    } catch (error) {
      if (signal?.aborted === true) return;
      if (error instanceof BridgeCallError && error.code === 'storage-unavailable') {
        clientStore.setRosterState({ readOnly: true });
        return;
      }
      console.warn('botharness: roster refresh failed', error);
    }
  };

  const reportRosterFailure = (error: unknown): void => {
    if (error instanceof BridgeCallError && error.code === 'storage-unavailable') {
      clientStore.setRosterState({ readOnly: true });
    }
    console.warn('botharness: roster write failed', error);
  };

  /** Run one durable arrangement mutation, then re-read `rosterGet`. */
  const rosterMutate = async (operation: () => Promise<void>): Promise<boolean> => {
    try {
      await operation();
      await refreshRoster();
      return true;
    } catch (error) {
      reportRosterFailure(error);
      return false;
    }
  };

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
        return;
      }
      await refreshRoster(signal);
    },
    refreshRoster,
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
    async createSection(name) {
      try {
        const section = await createRosterSection(call, name);
        await refreshRoster();
        return section;
      } catch (error) {
        reportRosterFailure(error);
        return undefined;
      }
    },
    async renameSection(sectionId, name) {
      return rosterMutate(async () => {
        await renameRosterSection(call, sectionId, name);
      });
    },
    async removeSection(sectionId) {
      return rosterMutate(async () => {
        await removeRosterSection(call, sectionId);
      });
    },
    async assignChannel(channelId, sectionId, index) {
      return rosterMutate(async () => {
        await assignRosterChannel(call, channelId, sectionId, index);
      });
    },
    async setSectionChannelOrder(sectionId, order) {
      const section = clientStore
        .getSnapshot()
        .roster.sections.find((candidate) => candidate.id === sectionId);
      if (section === undefined) return false;
      const target = planSectionChannelOrder(section, order);
      if (target === undefined) return true;
      return rosterMutate(async () => {
        for (let index = 0; index < target.length; index += 1) {
          await assignRosterChannel(call, target[index] as string, sectionId, index);
        }
      });
    },
    async moveChannel(channelId, sectionId, order) {
      return rosterMutate(async () => {
        for (let index = 0; index < order.length; index += 1) {
          await assignRosterChannel(call, order[index] as string, sectionId, index);
        }
      });
    },
    async reorderSections(order) {
      return rosterMutate(async () => {
        await reorderRosterSections(call, order);
      });
    },
    async reorderFlat(order) {
      return rosterMutate(async () => {
        await reorderTopOrder(call, order);
      });
    },
    async moveToFlat(channelId, order) {
      return rosterMutate(async () => {
        await assignRosterChannel(call, channelId, undefined);
        await reorderTopOrder(call, order);
      });
    },
    async ensureFlatTopOrder() {
      const snapshot = clientStore.getSnapshot();
      if (snapshot.roster.readOnly || snapshot.roster.topOrder !== undefined) return true;
      const sectioned = new Set(snapshot.roster.sections.flatMap((section) => section.channelIds));
      const order = completeFlatEntries(
        undefined,
        snapshot.roster.sections.map((section) => section.id),
        snapshot.channels
          .filter((channel) => channel.type === 'group')
          .map((channel) => channel.id),
        sectioned,
      );
      if (order.length === 0) return true;
      return rosterMutate(async () => {
        await reorderTopOrder(call, order);
      });
    },
  };
}
