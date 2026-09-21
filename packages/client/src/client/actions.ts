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
  renameRosterSection,
  reorderRosterSections,
  reorderTopOrder,
  sendChannelMessage,
  setRosterPins,
  type BridgeCall,
  type CreatePersonaBotInput,
} from './bridge.js';
import { planSectionChannelOrder, type RosterSection, type TopOrderEntry } from './roster.js';
import { completeFlatEntries, flatRosterChannelIds } from './roster-order.js';
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
  openAssignment(sessionId: string): Promise<void>;
  send(body: string): Promise<boolean>;
  createBot(input: CreatePersonaBotInput, sectionId?: string): Promise<BotSummary>;
  createGroup(name: string, sectionId?: string): Promise<ChannelSummary | undefined>;
  createSection(name: string): Promise<RosterSection | undefined>;
  renameSection(sectionId: string, name: string): Promise<boolean>;
  removeSection(sectionId: string): Promise<boolean>;
  /** Add or remove one PersonaBot from the durable pinned-grid order. */
  setBotPinned(slug: string, pinned: boolean): Promise<boolean>;
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
  return [
    ...messages.filter((message) => message.id !== localId && message.id !== committed.id),
    committed,
  ];
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
    const flat = completeFlatEntries(
      snapshot.roster.topOrder,
      snapshot.roster.sections.map((section) => section.id),
      flatRosterChannelIds(snapshot.channels, new Set(snapshot.roster.pins)),
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
      await loadAssignmentsFor(slug, selection);
    },
    openChannel(channelId) {
      return openChannelById(channelId);
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
        const assignments =
          selection?.kind === 'bot' ? await loadAssignments(call, selection.slug) : undefined;
        const latest = clientStore.getSnapshot();
        if (latest.conversation.channel?.id !== channel.id) return false;
        clientStore.upsertChannel({ ...channel, updatedAt: message.at });
        clientStore.setConversation({
          sending: false,
          messages: reconcileCommittedMessage(latest.conversation.messages, localId, message),
        });
        if (selection?.kind === 'bot' && currentSelection() === selection) {
          clientStore.setAssignments({
            status: 'ready',
            items: assignments ?? [],
            error: undefined,
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
      clientStore.select({ kind: 'bot', slug: bot.slug });
      return bot;
    },
    async createGroup(name, sectionId) {
      const channel = await createGroupChannel(call, name);
      clientStore.upsertChannel(channel);
      await placeCreatedChannelFirst(channel.id, sectionId);
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
    async setBotPinned(slug, pinned) {
      const current = clientStore.getSnapshot().roster.pins;
      const next = pinned
        ? [...current.filter((candidate) => candidate !== slug), slug]
        : current.filter((candidate) => candidate !== slug);
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
        flatRosterChannelIds(snapshot.channels, new Set(snapshot.roster.pins)),
        sectioned,
      );
      if (order.length === 0) return true;
      return rosterMutate(async () => {
        await reorderTopOrder(call, order);
      });
    },
  };
}
