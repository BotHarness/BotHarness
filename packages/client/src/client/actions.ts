import {
  assignRosterChannel,
  BridgeCallError,
  createGroupChannel,
  createPersonaBot,
  createRosterSection,
  errorMessage,
  loadAssignment,
  loadAssignments,
  loadBots,
  loadChannelMessages,
  loadChannels,
  loadRoster,
  openDmChannel,
  removeRosterSection,
  renameChannel as renameChannelViaBridge,
  renameRosterSection,
  reorderRosterSections,
  reorderTopOrder,
  sendChannelMessage,
  setRosterHidden,
  setRosterPins,
  type BridgeCall,
  type CreatePersonaBotInput,
} from './bridge.js';
import {
  planSectionChannelOrder,
  sameIds,
  type RosterSection,
  type TopOrderEntry,
} from './roster.js';
import {
  completeFlatEntries,
  flatRosterChannelIds,
  resolvePinnedChannelIds,
} from './roster-order.js';
import type {
  BotSummary,
  ChannelMessage,
  ChannelSummary,
  ClientStore,
  ConversationSelection,
} from './store.js';

export interface BridgeActions {
  load(signal?: AbortSignal): Promise<void>;
  refreshRoster(signal?: AbortSignal): Promise<void>;
  openBot(slug: string): Promise<void>;
  openChannel(channelId: string): Promise<void>;
  refreshChannelMessages(channelId: string): Promise<void>;
  openAssignment(sessionId: string): Promise<void>;
  send(body: string): Promise<boolean>;
  createBot(input: CreatePersonaBotInput, sectionId?: string): Promise<BotSummary>;
  createGroup(name: string, sectionId?: string): Promise<ChannelSummary | undefined>;
  renameChannel(channelId: string, name: string): Promise<boolean>;
  createSection(name: string): Promise<RosterSection | undefined>;
  renameSection(sectionId: string, name: string): Promise<boolean>;
  removeSection(sectionId: string): Promise<boolean>;
  /** Add or remove one Channel from the durable pinned-grid order. */
  setChannelPinned(channelId: string, pinned: boolean): Promise<boolean>;
  /** Hide or restore one Channel without changing its pin, section, or order. */
  setChannelHidden(channelId: string, hidden: boolean): Promise<boolean>;
  /** Unpin one Channel and place it at an exact position inside a section. */
  movePinnedChannel(
    channelId: string,
    sectionId: string,
    order: readonly string[],
  ): Promise<boolean>;
  /** Unpin one Channel and place it at an exact loose top-level position. */
  movePinnedChannelToFlat(channelId: string, order: readonly TopOrderEntry[]): Promise<boolean>;
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
  /** Convert legacy PersonaBot-slug pins into canonical Channel ids once. */
  ensureChannelPins(): Promise<boolean>;
  /**
   * Convert a pre-flat host arrangement once: sections in snapshot order,
   * then every unsectioned channel loose at the end. Skips when the host
   * already carries a flat order, is read-only, or holds nothing to convert.
   */
  ensureFlatTopOrder(): Promise<boolean>;
}

let localEchoSequence = 0;

function nextLocalEchoId(): string {
  localEchoSequence += 1;
  return `local-echo-${Date.now().toString(36)}-${localEchoSequence}`;
}

function reconcileCommittedMessage(
  messages: readonly ChannelMessage[],
  localId: string,
  committed: ChannelMessage,
): ChannelMessage[] {
  if (messages.some((message) => message.id === committed.id)) {
    return messages.filter((message) => message.id !== localId);
  }
  const index = messages.findIndex((message) => message.id === localId);
  if (index < 0) return [...messages, committed];
  return messages.map((message) => (message.id === localId ? committed : message));
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
        hidden: snapshot.hidden,
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

  /** Place a newly created Channel first in its requested roster scope. */
  const placeCreatedChannelFirst = async (
    channelId: string,
    sectionId: string | undefined,
  ): Promise<boolean> => {
    if (sectionId !== undefined) {
      return rosterMutate(async () => {
        await assignRosterChannel(call, channelId, sectionId, 0);
      });
    }
    const snapshot = clientStore.getSnapshot();
    const sectioned = new Set(snapshot.roster.sections.flatMap((section) => section.channelIds));
    const pinnedChannelIds = resolvePinnedChannelIds(snapshot.channels, snapshot.roster.pins);
    const flat = completeFlatEntries(
      snapshot.roster.topOrder,
      snapshot.roster.sections.map((section) => section.id),
      flatRosterChannelIds(snapshot.channels, new Set(pinnedChannelIds)),
      sectioned,
    );
    const order: TopOrderEntry[] = [
      { kind: 'channel', id: channelId },
      ...flat.filter((entry) => entry.kind !== 'channel' || entry.id !== channelId),
    ];
    return rosterMutate(async () => {
      await reorderTopOrder(call, order);
    });
  };

  const loadAssignmentsFor = async (
    slug: string,
    selection: ConversationSelection,
  ): Promise<void> => {
    clientStore.setAssignments({
      status: 'loading',
      items: [],
      selected: undefined,
      error: undefined,
    });
    try {
      const items = await loadAssignments(call, slug);
      if (currentSelection() !== selection) return;
      clientStore.setAssignments({ status: 'ready', items, error: undefined });
    } catch (error) {
      if (currentSelection() !== selection) return;
      clientStore.setAssignments({
        status: 'error',
        items: [],
        selected: undefined,
        error: errorMessage(error),
      });
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
      revision: 0,
      error: undefined,
      sending: false,
    });
    try {
      const { messages, revision } = await loadChannelMessages(call, channelId);
      if (currentSelection() !== selection) return;
      clientStore.setConversation({
        status: 'ready',
        channel,
        messages,
        revision,
        error: undefined,
        sending: false,
      });
    } catch (error) {
      if (currentSelection() !== selection) return;
      clientStore.setConversation({ status: 'error', error: errorMessage(error), sending: false });
    }
  };

  const openBot = async (slug: string): Promise<void> => {
    const snapshot = clientStore.getSnapshot();
    const bot = snapshot.bots.find((candidate) => candidate.slug === slug);
    if (bot === undefined) return;
    const selection: ConversationSelection = { kind: 'bot', slug };
    clientStore.select(selection);
    clientStore.setConversation({
      status: 'loading',
      channel: undefined,
      messages: [],
      revision: 0,
      error: undefined,
      sending: false,
    });
    try {
      const channel = await openDmChannel(call, slug, bot.displayName);
      const { messages, revision } = await loadChannelMessages(call, channel.id);
      if (currentSelection() !== selection) return;
      const latestMessage = messages.at(-1);
      const projectedChannel =
        latestMessage === undefined
          ? channel
          : { ...channel, updatedAt: latestMessage.at, latestMessage };
      clientStore.upsertChannel(projectedChannel);
      clientStore.setConversation({
        status: 'ready',
        channel: projectedChannel,
        messages,
        revision,
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
    await loadAssignmentsFor(slug, selection);
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
    openBot,
    openChannel(channelId) {
      return openChannelById(channelId);
    },
    async refreshChannelMessages(channelId) {
      const page = await loadChannelMessages(call, channelId);
      const snapshot = clientStore.getSnapshot();
      if (snapshot.conversation.channel?.id !== channelId) return;
      if (page.revision < snapshot.conversation.revision) return;
      const pending = snapshot.conversation.messages.filter((message) => message.pending === true);
      clientStore.setConversation({
        messages: [...page.messages, ...pending],
        revision: page.revision,
      });
    },
    async openAssignment(sessionId) {
      const selection = currentSelection();
      if (selection?.kind !== 'bot') return;
      try {
        const assignment = await loadAssignment(call, selection.slug, sessionId);
        if (currentSelection() !== selection) return;
        clientStore.setAssignments({ selected: assignment, error: undefined });
      } catch (error) {
        if (currentSelection() !== selection) return;
        clientStore.setAssignments({ error: errorMessage(error) });
      }
    },
    async send(body) {
      const snapshot = clientStore.getSnapshot();
      const channel = snapshot.conversation.channel;
      const text = body.trim();
      if (channel === undefined || text.length === 0 || snapshot.conversation.sending) return false;
      const localId = nextLocalEchoId();
      clientStore.setConversation({
        sending: true,
        error: undefined,
        messages: [
          ...snapshot.conversation.messages,
          {
            id: localId,
            at: new Date().toISOString(),
            author: { kind: 'human' },
            body: text,
            pending: true,
          },
        ],
      });
      try {
        const message = await sendChannelMessage(call, channel.id, text);
        const selection = currentSelection();
        const latest = clientStore.getSnapshot();
        if (latest.conversation.channel?.id === channel.id) {
          const visibleChannel = latest.conversation.channel;
          if (
            visibleChannel.latestMessage === undefined ||
            visibleChannel.latestMessage.at <= message.at
          ) {
            clientStore.upsertChannel({
              ...visibleChannel,
              updatedAt: message.at,
              latestMessage: message,
            });
          }
          clientStore.setConversation({
            sending: false,
            messages: reconcileCommittedMessage(latest.conversation.messages, localId, message),
          });
        }
        if (selection?.kind === 'bot') {
          void loadAssignments(call, selection.slug)
            .then((items) => {
              if (currentSelection() !== selection) return;
              clientStore.setAssignments({ status: 'ready', items, error: undefined });
            })
            .catch((error: unknown) => {
              console.warn('botharness: assignment refresh failed', error);
            });
        }
        return true;
      } catch (error) {
        if (clientStore.getSnapshot().conversation.channel?.id === channel.id) {
          const latest = clientStore.getSnapshot();
          clientStore.setConversation({
            sending: false,
            error: errorMessage(error),
            messages: latest.conversation.messages.filter((message) => message.id !== localId),
          });
        }
        return false;
      }
    },
    async createBot(input, sectionId) {
      const bot = await createPersonaBot(call, input);
      const channel = await openDmChannel(call, bot.slug, bot.displayName);
      clientStore.upsertBot(bot);
      clientStore.upsertChannel(channel);
      await placeCreatedChannelFirst(channel.id, sectionId);
      await openBot(bot.slug);
      return bot;
    },
    async createGroup(name, sectionId) {
      const channel = await createGroupChannel(call, name);
      clientStore.upsertChannel(channel);
      await placeCreatedChannelFirst(channel.id, sectionId);
      await openChannelById(channel.id);
      return channel;
    },
    async renameChannel(channelId, name) {
      try {
        const result = await renameChannelViaBridge(call, channelId, name);
        clientStore.upsertChannel(result.channel);
        if (result.bot !== undefined) clientStore.upsertBot(result.bot);
        if (clientStore.getSnapshot().conversation.channel?.id === channelId) {
          clientStore.setConversation({ channel: result.channel });
        }
        return true;
      } catch (error) {
        console.warn('botharness: channel rename failed', error);
        return false;
      }
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
    async setChannelPinned(channelId, pinned) {
      const snapshot = clientStore.getSnapshot();
      const current = resolvePinnedChannelIds(snapshot.channels, snapshot.roster.pins);
      const next = pinned
        ? [...current.filter((candidate) => candidate !== channelId), channelId]
        : current.filter((candidate) => candidate !== channelId);
      if (
        next.length === current.length &&
        next.every((candidate, index) => candidate === current[index])
      ) {
        return true;
      }
      return rosterMutate(async () => {
        await setRosterPins(call, next);
      });
    },
    async setChannelHidden(channelId, hidden) {
      const current = [...clientStore.getSnapshot().roster.hidden];
      const next = hidden
        ? [...current.filter((candidate) => candidate !== channelId), channelId]
        : current.filter((candidate) => candidate !== channelId);
      if (sameIds(next, current)) return true;
      return rosterMutate(async () => {
        await setRosterHidden(call, next);
      });
    },
    async movePinnedChannel(channelId, sectionId, order) {
      const snapshot = clientStore.getSnapshot();
      const nextPins = resolvePinnedChannelIds(snapshot.channels, snapshot.roster.pins).filter(
        (candidate) => candidate !== channelId,
      );
      return rosterMutate(async () => {
        for (let index = 0; index < order.length; index += 1) {
          await assignRosterChannel(call, order[index] as string, sectionId, index);
        }
        await setRosterPins(call, nextPins);
      });
    },
    async movePinnedChannelToFlat(channelId, order) {
      const snapshot = clientStore.getSnapshot();
      const nextPins = resolvePinnedChannelIds(snapshot.channels, snapshot.roster.pins).filter(
        (candidate) => candidate !== channelId,
      );
      return rosterMutate(async () => {
        await assignRosterChannel(call, channelId, undefined);
        await reorderTopOrder(call, order);
        await setRosterPins(call, nextPins);
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
    async ensureChannelPins() {
      const snapshot = clientStore.getSnapshot();
      if (snapshot.roster.readOnly) return true;
      const pins = resolvePinnedChannelIds(snapshot.channels, snapshot.roster.pins);
      if (
        pins.length === snapshot.roster.pins.length &&
        pins.every((channelId, index) => channelId === snapshot.roster.pins[index])
      ) {
        return true;
      }
      return rosterMutate(async () => {
        await setRosterPins(call, pins);
      });
    },
    async ensureFlatTopOrder() {
      const snapshot = clientStore.getSnapshot();
      if (snapshot.roster.readOnly || snapshot.roster.topOrder !== undefined) return true;
      const sectioned = new Set(snapshot.roster.sections.flatMap((section) => section.channelIds));
      const pinnedChannelIds = resolvePinnedChannelIds(snapshot.channels, snapshot.roster.pins);
      const order = completeFlatEntries(
        undefined,
        snapshot.roster.sections.map((section) => section.id),
        flatRosterChannelIds(snapshot.channels, new Set(pinnedChannelIds)),
        sectioned,
      );
      if (order.length === 0) return true;
      return rosterMutate(async () => {
        await reorderTopOrder(call, order);
      });
    },
  };
}
