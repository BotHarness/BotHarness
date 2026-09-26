import {
  applyRosterBatch,
  assignRosterChannel,
  BridgeCallError,
  createGroupChannel,
  cancelGroupInvitation,
  decideGroupJoin,
  removeGroupMember,
  setGroupWakePolicy,
  deleteGroupChannel,
  createPersonaBot,
  createRosterSection,
  errorMessage,
  loadAssignment,
  loadWorkspaceOptions,
  loadWorkspaceGrants,
  loadToolApprovalRules,
  loadAssignmentAccess,
  setAssignmentAccess,
  type AssignmentAccessPresetView,
  revokeToolApprovalRule,
  type ToolApprovalRuleView,
  createWorkspaceGrant,
  revokeWorkspaceGrant,
  loadToolApprovalStatus,
  decideToolApproval,
  loadUserQuestionStatus,
  answerUserQuestion,
  type WorkspaceOption,
  type WorkspaceGrantView,
  loadAssignments,
  loadBotAttention,
  loadHumanAttention,
  loadBots,
  loadMemorySnapshot,
  loadMemoryFile,
  loadMemoryHistory,
  loadMemoryDiff,
  loadMemoryGitGraph,
  loadMemoryGitCommitDiff,
  saveMemoryFile,
  repairMemory,
  loadTimelinePage,
  loadReadPosition,
  markReadPosition,
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
  type MemoryAcceptedCommit,
  type MemorySnapshot,
  type MemoryGitGraph,
  type MemoryGitCommitDiff,
  type MemoryRepairEvent,
  type CreatePersonaBotInput,
  type RosterBatchInput,
} from './bridge.js';
import {
  planSectionChannelOrder,
  sameIds,
  type RosterSection,
  type TopOrderEntry,
} from './roster.js';
import { initialTimeline } from './store.js';
import {
  completeFlatEntries,
  flatRosterChannelIds,
  resolvePinnedChannelIds,
} from './roster-order.js';
import type {
  BotSummary,
  ChannelAttachmentRef,
  ChannelMessage,
  ChannelSummary,
  ClientStore,
  ConversationSelection,
  HumanInboxCategory,
  HumanInboxFilters,
  UserQuestionAnswerItem,
} from './store.js';

export interface HostDirectoryListing {
  path: string;
  home: string;
  crumbs: { name: string; path: string; hidden: boolean }[];
  entries: { name: string; path: string; hidden: boolean }[];
  truncated: boolean;
}

export interface BridgeActions {
  listHostFolders(path?: string, signal?: AbortSignal): Promise<HostDirectoryListing>;
  addWorkspaceFolder(slug: string): Promise<WorkspaceGrantView | undefined>;
  authorizeWorkspacePath(slug: string, path: string): Promise<WorkspaceGrantView>;
  memoryDirectory(slug: string): Promise<string | undefined>;
  load(signal?: AbortSignal): Promise<void>;
  refreshRoster(signal?: AbortSignal): Promise<void>;
  openBot(slug: string): Promise<void>;
  refreshBotInbox(slug: string): Promise<void>;
  openHumanInbox(): Promise<void>;
  refreshHumanInbox(category?: HumanInboxCategory): Promise<void>;
  setHumanInboxFilters(filters: HumanInboxFilters): Promise<void>;
  loadMoreHumanInbox(): Promise<void>;
  loadMoreBotInbox(slug: string): Promise<void>;
  openChannel(channelId: string): Promise<void>;
  loadOlder(channelId: string): Promise<void>;
  loadNewer(channelId: string): Promise<void>;
  openLatest(channelId: string): Promise<void>;
  openAround(channelId: string, messageId: string): Promise<void>;
  markRead(channelId: string, messageId: string): Promise<void>;
  refreshChannelMessages(channelId: string): Promise<void>;
  dismissFailedMessage(channelId: string, messageId: string): boolean;
  openAssignment(sessionId: string): Promise<void>;
  memorySnapshot(channelId: string): Promise<MemorySnapshot>;
  memoryFile(
    channelId: string,
    path: string,
  ): Promise<{ path: string; body: string; head: string } | undefined>;
  memoryHistory(channelId: string): Promise<MemoryAcceptedCommit[]>;
  memoryDiff(channelId: string, sha: string): Promise<string>;
  memoryGitGraph(channelId: string, offset: number): Promise<MemoryGitGraph>;
  memoryGitCommitDiff(channelId: string, sha: string): Promise<MemoryGitCommitDiff>;
  memoryRepair(input: {
    channelId: string;
    expectedHead: string;
    repairId: string;
  }): Promise<MemoryRepairEvent>;
  memorySave(input: {
    channelId: string;
    path: string;
    body: string;
    expectedHead: string;
    editId: string;
  }): Promise<MemoryAcceptedCommit>;
  listWorkspaceOptions(): Promise<WorkspaceOption[]>;
  listWorkspaceGrants(slug: string): Promise<WorkspaceGrantView[]>;
  createWorkspaceGrant(slug: string, workspaceId: string): Promise<WorkspaceGrantView>;
  revokeWorkspaceGrant(slug: string, grantId: string): Promise<WorkspaceGrantView>;
  assignmentAccess(slug: string): Promise<AssignmentAccessPresetView>;
  setAssignmentAccess(
    slug: string,
    mode: AssignmentAccessPresetView['mode'],
    acknowledgeRisk: boolean,
  ): Promise<AssignmentAccessPresetView>;
  listToolApprovalRules(slug: string): Promise<ToolApprovalRuleView[]>;
  revokeToolApprovalRule(slug: string, id: string): Promise<void>;
  toolApprovalStatus(channelId: string, messageId: string): Promise<'pending' | 'expired'>;
  decideToolApproval(
    channelId: string,
    messageId: string,
    outcome: 'allowed-once' | 'allowed-always-exact' | 'allowed-always-all' | 'rejected',
  ): Promise<void>;
  userQuestionStatus(channelId: string, messageId: string): Promise<'pending' | 'expired'>;
  answerUserQuestion(
    channelId: string,
    messageId: string,
    answers: UserQuestionAnswerItem[],
  ): Promise<void>;
  send(
    body: string,
    replyTo?: string,
    attachments?: ChannelAttachmentRef[],
    memorySwitchTarget?: string,
    mentions?: ChannelMessage['mentions'],
    channelRefs?: ChannelMessage['channelRefs'],
  ): Promise<boolean>;
  createBot(input: CreatePersonaBotInput, sectionId?: string): Promise<BotSummary>;
  createGroup(name: string, sectionId?: string): Promise<ChannelSummary | undefined>;
  renameChannel(channelId: string, name: string): Promise<boolean>;
  cancelGroupInvitation(channelId: string, invitationId: string): Promise<boolean>;
  decideGroupJoin(channelId: string, requestId: string, accept: boolean): Promise<boolean>;
  removeGroupMember(channelId: string, botSlug: string): Promise<boolean>;
  setGroupWakePolicy(
    channelId: string,
    botSlug: string,
    policy: { mode: 'mentions' | 'digest' | 'silent'; count: number; intervalSeconds: number },
  ): Promise<boolean>;
  deleteGroupChannel(channelId: string): Promise<boolean>;
  createSection(name: string): Promise<RosterSection | undefined>;
  renameSection(sectionId: string, name: string): Promise<boolean>;
  removeSection(sectionId: string): Promise<boolean>;
  /** Add or remove one Channel from the durable pinned-grid order. */
  setChannelPinned(channelId: string, pinned: boolean): Promise<boolean>;
  /** Reorder exactly the currently pinned Channels, preserving pin membership. */
  reorderPinnedChannels(order: readonly string[], beforePublish: () => void): Promise<boolean>;
  /** Hide or restore one Channel without changing its pin, section, or order. */
  setChannelHidden(channelId: string, hidden: boolean): Promise<boolean>;
  /** Apply one bounded multi-select operation and publish only its final roster snapshot. */
  batchRoster(input: RosterBatchInput): Promise<boolean>;
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
  const fallback = `${localEchoSequence.toString(16).padStart(8, '0').slice(-8)}-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;
  const unique = globalThis.crypto?.randomUUID?.() ?? fallback;
  return `human-${unique}`;
}

function reconcileCommittedMessage(
  messages: readonly ChannelMessage[],
  localId: string,
  committed: ChannelMessage,
): ChannelMessage[] {
  if (committed.id !== localId && messages.some((message) => message.id === committed.id)) {
    return messages.filter((message) => message.id !== localId);
  }
  const index = messages.findIndex((message) => message.id === localId);
  if (index < 0) return [...messages, committed];
  return messages.map((message) => (message.id === localId ? committed : message));
}

/** Preserve an already visible prefix only when it overlaps the fresh latest window. */
function mergeLatestWindow(
  previous: readonly ChannelMessage[],
  incoming: readonly ChannelMessage[],
): { messages: ChannelMessage[]; keptPrefix: boolean } {
  const first = incoming[0];
  const overlap = first === undefined ? -1 : previous.findIndex((item) => item.id === first.id);
  const prefix = overlap < 0 ? [] : previous.slice(0, overlap);
  const seen = new Set<string>();
  const messages = [
    ...prefix,
    ...incoming,
    ...previous.filter((item) => item.pending === true || item.failed !== undefined),
  ].filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  return { messages, keptPrefix: overlap >= 0 };
}

export function createActions(
  call: BridgeCall,
  clientStore: ClientStore,
  folderAccess?: {
    pickDirectory(): Promise<string | null>;
    listDirectory?(path?: string, signal?: AbortSignal): Promise<HostDirectoryListing>;
    createWorkspace(input: { path: string }): Promise<{ workspaceId: string }>;
  },
): BridgeActions {
  const failedByChannel = new Map<string, ChannelMessage[]>();
  const localFailedFor = (id: string): ChannelMessage[] => failedByChannel.get(id) ?? [];
  const remainingFailures = (
    channelId: string,
    committed: readonly ChannelMessage[],
  ): ChannelMessage[] => {
    const committedIds = new Set(committed.map((message) => message.id));
    const current = localFailedFor(channelId);
    const next = current.filter((message) => !committedIds.has(message.id));
    if (next.length !== current.length) {
      failedByChannel.set(channelId, next);
    }
    return next;
  };
  const currentSelection = (): ConversationSelection | undefined =>
    clientStore.getSnapshot().selection;
  const selectedBotSlug = (selection: ConversationSelection | undefined): string | undefined => {
    if (selection?.kind === 'bot') return selection.slug;
    if (selection?.kind !== 'channel') return undefined;
    const channel = clientStore.getSnapshot().conversation.channel;
    return channel?.id === selection.channelId && channel.type === 'dm'
      ? channel.botSlug
      : undefined;
  };

  const refreshRoster = async (signal?: AbortSignal): Promise<void> => {
    const [rosterResult, channelResult] = await Promise.allSettled([
      loadRoster(call, signal),
      loadChannels(call, signal),
    ]);
    if (signal?.aborted === true) return;
    if (channelResult.status === 'fulfilled') {
      const channels = channelResult.value;
      const current = clientStore.getSnapshot().conversation.channel;
      clientStore.setRoster(clientStore.getSnapshot().bots, channels);
      if (current !== undefined) {
        const updated = channels.find((item) => item.id === current.id);
        if (updated !== undefined) clientStore.setConversation({ channel: updated });
      }
    } else {
      console.warn('botharness: channel refresh failed', channelResult.reason);
    }
    if (rosterResult.status === 'fulfilled') {
      const snapshot = rosterResult.value;
      clientStore.setRosterState({
        pins: snapshot.pins,
        hidden: snapshot.hidden,
        sections: snapshot.sections,
        topOrder: snapshot.topOrder,
        readOnly: false,
      });
    } else if (
      rosterResult.reason instanceof BridgeCallError &&
      rosterResult.reason.code === 'storage-unavailable'
    ) {
      clientStore.setRosterState({ readOnly: true });
    } else {
      console.warn('botharness: roster refresh failed', rosterResult.reason);
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

  let botInboxRequestSeq = 0;
  const loadBotInboxFor = async (
    slug: string,
    selection: ConversationSelection,
    cursor?: string,
  ): Promise<void> => {
    const requestSeq = ++botInboxRequestSeq;
    if (cursor === undefined && clientStore.getSnapshot().botInbox.status === 'idle')
      clientStore.setBotInbox({ status: 'loading', error: undefined });
    try {
      const page = await loadBotAttention(call, slug, 50, cursor);
      if (currentSelection() !== selection || requestSeq !== botInboxRequestSeq) return;
      const priorState = clientStore.getSnapshot().botInbox;
      const prior = priorState.items;
      const seen = new Set(page.items.map((item) => item.id));
      const items =
        cursor === undefined
          ? [...page.items, ...prior.filter((item) => !seen.has(item.id))]
          : [...prior, ...page.items.filter((item) => !prior.some((seen) => seen.id === item.id))];
      const nextCursor =
        cursor === undefined && prior.length > 50 ? priorState.nextCursor : page.nextCursor;
      clientStore.setBotInbox({
        status: 'ready',
        items,
        nextCursor,
        error: undefined,
      });
    } catch (error) {
      if (currentSelection() !== selection || requestSeq !== botInboxRequestSeq) return;
      clientStore.setBotInbox({ status: 'error', error: errorMessage(error) });
    }
  };

  let humanInboxHeadSeq = 0;
  let humanInboxPageSeq = 0;
  let humanInboxScopeVersion = 0;
  const loadHumanInboxFor = async (
    category: HumanInboxCategory,
    selection: ConversationSelection,
    cursor?: string,
  ): Promise<void> => {
    const head = cursor === undefined;
    const requestSeq = head ? ++humanInboxHeadSeq : ++humanInboxPageSeq;
    const scopeVersion = humanInboxScopeVersion;
    const { botSlug, channelId, sort } = clientStore.getSnapshot().humanInbox;
    const isCurrent = (): boolean =>
      currentSelection() === selection &&
      scopeVersion === humanInboxScopeVersion &&
      requestSeq === (head ? humanInboxHeadSeq : humanInboxPageSeq);
    if (cursor === undefined && clientStore.getSnapshot().humanInbox.status === 'idle')
      clientStore.setHumanInbox({ status: 'loading', error: undefined });
    try {
      const page = await loadHumanAttention(call, category, 50, cursor, {
        botSlug,
        channelId,
        sort,
      });
      if (!isCurrent()) return;
      const priorState = clientStore.getSnapshot().humanInbox;
      if (priorState.category !== category) return;
      const prior = priorState.items;
      const preserveOlder = head && prior.length > 50 && page.nextCursor !== undefined;
      const refreshedIds = new Set(page.items.map((item) => item.id));
      const items = head
        ? preserveOlder
          ? [...page.items, ...prior.filter((item) => !refreshedIds.has(item.id))]
          : page.items
        : [...prior, ...page.items.filter((item) => !prior.some((seen) => seen.id === item.id))];
      clientStore.setHumanInbox({
        status: 'ready',
        items,
        nextCursor: preserveOlder ? priorState.nextCursor : page.nextCursor,
        error: undefined,
      });
    } catch (error) {
      if (!isCurrent() || clientStore.getSnapshot().humanInbox.category !== category) return;
      clientStore.setHumanInbox({ status: 'error', error: errorMessage(error) });
    }
  };
  const loadOpeningTimeline = async (channelId: string) => {
    const anchor = await loadReadPosition(call, channelId);
    if (anchor !== undefined) {
      try {
        return {
          ...(await loadTimelinePage(call, channelId, { direction: 'around', around: anchor })),
          focusMessageId: anchor,
        };
      } catch (error) {
        // The message may have disappeared between reading the marker and paging.
        if (!(error instanceof BridgeCallError) || error.code !== 'invalid-input') throw error;
      }
    }
    return { ...(await loadTimelinePage(call, channelId)), focusMessageId: undefined };
  };

  const openChannelById = async (channelId: string): Promise<void> => {
    const snapshot = clientStore.getSnapshot();
    const channel = snapshot.channels.find((candidate) => candidate.id === channelId);
    if (channel === undefined) return;
    const selection: ConversationSelection = { kind: 'channel', channelId };
    clientStore.select(selection);
    const active = currentSelection();
    if (active === undefined) return;
    clientStore.setConversation({
      status: 'loading',
      channel,
      messages: [],
      revision: 0,
      timeline: initialTimeline(),
      focusMessageId: undefined,
      error: undefined,
      sending: false,
    });
    try {
      const { page, revision, focusMessageId } = await loadOpeningTimeline(channelId);
      const failures = remainingFailures(channelId, page.entries);
      const messages = page.hasNewer ? page.entries : [...page.entries, ...failures];
      if (currentSelection() !== active) return;
      clientStore.setConversation({
        status: 'ready',
        channel,
        messages,
        revision,
        timeline: { ...initialTimeline(), ...page },
        focusMessageId,
        error: undefined,
        sending: false,
      });
    } catch (error) {
      if (currentSelection() !== active) return;
      clientStore.setConversation({ status: 'error', error: errorMessage(error), sending: false });
    }
    if (channel.type === 'dm' && channel.botSlug !== undefined) {
      await loadAssignmentsFor(channel.botSlug, active);
    }
  };

  const actions: BridgeActions = {
    listHostFolders(path, signal) {
      if (folderAccess?.listDirectory === undefined)
        throw new Error('DSH folder browser is unavailable');
      return folderAccess.listDirectory(path, signal);
    },
    async addWorkspaceFolder(slug) {
      if (folderAccess === undefined) throw new Error('DSH folder picker is unavailable');
      const path = await folderAccess.pickDirectory();
      if (path === null) return undefined;
      const workspace = await folderAccess.createWorkspace({ path });
      return createWorkspaceGrant(call, slug, workspace.workspaceId);
    },
    async authorizeWorkspacePath(slug, path) {
      if (folderAccess === undefined) throw new Error('DSH Workspace controller is unavailable');
      const workspace = await folderAccess.createWorkspace({ path });
      return createWorkspaceGrant(call, slug, workspace.workspaceId);
    },
    async memoryDirectory(slug) {
      const result = await call('get', { slug });
      if (!result.ok) throw new BridgeCallError(result.error.code, result.error.message);
      const bot = (result.value as { bot?: { memoryDir?: unknown } }).bot;
      return typeof bot?.memoryDir === 'string' ? bot.memoryDir : undefined;
    },
    listWorkspaceOptions: () => loadWorkspaceOptions(call),
    listWorkspaceGrants: (slug) => loadWorkspaceGrants(call, slug),
    createWorkspaceGrant: (slug, workspaceId) => createWorkspaceGrant(call, slug, workspaceId),
    revokeWorkspaceGrant: (slug, grantId) => revokeWorkspaceGrant(call, slug, grantId),
    assignmentAccess: (slug) => loadAssignmentAccess(call, slug),
    setAssignmentAccess: (slug, mode, acknowledgeRisk) =>
      setAssignmentAccess(call, slug, mode, acknowledgeRisk),
    listToolApprovalRules: (slug) => loadToolApprovalRules(call, slug),
    revokeToolApprovalRule: (slug, id) => revokeToolApprovalRule(call, slug, id),
    toolApprovalStatus: (channelId, messageId) =>
      loadToolApprovalStatus(call, channelId, messageId),
    decideToolApproval: (channelId, messageId, outcome) =>
      decideToolApproval(call, channelId, messageId, outcome),
    userQuestionStatus: (channelId, messageId) =>
      loadUserQuestionStatus(call, channelId, messageId),
    answerUserQuestion: (channelId, messageId, answers) =>
      answerUserQuestion(call, channelId, messageId, answers),
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
      // `select` may retain its existing object; compare the active request token.
      const active = currentSelection();
      if (active === undefined) return;
      clientStore.setConversation({
        status: 'loading',
        channel: undefined,
        messages: [],
        revision: 0,
        timeline: initialTimeline(),
        focusMessageId: undefined,
        error: undefined,
        sending: false,
      });
      try {
        const channel = await openDmChannel(call, slug, bot.displayName);
        const { page, revision, focusMessageId } = await loadOpeningTimeline(channel.id);
        const messages = page.entries;
        if (currentSelection() !== active) return;
        const listedChannel = clientStore
          .getSnapshot()
          .channels.find((candidate) => candidate.id === channel.id);
        const latestMessage = page.hasNewer ? undefined : messages.at(-1);
        const projectedChannel =
          listedChannel?.latestMessage !== undefined
            ? listedChannel
            : latestMessage === undefined
              ? (listedChannel ?? channel)
              : { ...(listedChannel ?? channel), updatedAt: latestMessage.at, latestMessage };
        clientStore.upsertChannel(projectedChannel);
        clientStore.setConversation({
          status: 'ready',
          channel: projectedChannel,
          messages: page.hasNewer
            ? messages
            : [...messages, ...remainingFailures(channel.id, page.entries)],
          revision,
          timeline: { ...initialTimeline(), ...page },
          focusMessageId,
          error: undefined,
          sending: false,
        });
      } catch (error) {
        if (currentSelection() !== active) return;
        clientStore.setConversation({
          status: 'error',
          error: errorMessage(error),
          sending: false,
        });
      }
      await Promise.all([loadAssignmentsFor(slug, active), loadBotInboxFor(slug, active)]);
    },
    refreshBotInbox(slug) {
      const selection = currentSelection();
      if (selection?.kind !== 'bot' || selection.slug !== slug) return Promise.resolve();
      return loadBotInboxFor(slug, selection);
    },
    loadMoreBotInbox(slug) {
      const selection = currentSelection();
      const cursor = clientStore.getSnapshot().botInbox.nextCursor;
      if (selection?.kind !== 'bot' || selection.slug !== slug || cursor === undefined)
        return Promise.resolve();
      return loadBotInboxFor(slug, selection, cursor);
    },
    openHumanInbox() {
      clientStore.select({ kind: 'inbox' });
      const selection = currentSelection();
      if (selection?.kind !== 'inbox') return Promise.resolve();
      return loadHumanInboxFor(clientStore.getSnapshot().humanInbox.category, selection);
    },
    refreshHumanInbox(category) {
      const selection = currentSelection();
      if (selection?.kind !== 'inbox') return Promise.resolve();
      const prior = clientStore.getSnapshot().humanInbox;
      const nextCategory = category ?? prior.category;
      if (nextCategory !== prior.category) {
        humanInboxScopeVersion += 1;
        clientStore.setHumanInbox({
          category: nextCategory,
          channelId: undefined,
          status: 'loading',
          items: [],
          nextCursor: undefined,
          error: undefined,
        });
      }
      return loadHumanInboxFor(nextCategory, selection);
    },
    setHumanInboxFilters(filters) {
      const selection = currentSelection();
      if (selection?.kind !== 'inbox') return Promise.resolve();
      const prior = clientStore.getSnapshot().humanInbox;
      if (
        prior.botSlug === filters.botSlug &&
        prior.channelId === filters.channelId &&
        prior.sort === filters.sort
      )
        return Promise.resolve();
      humanInboxScopeVersion += 1;
      clientStore.setHumanInbox({
        ...filters,
        status: 'loading',
        items: [],
        nextCursor: undefined,
        error: undefined,
      });
      return loadHumanInboxFor(prior.category, selection);
    },
    loadMoreHumanInbox() {
      const selection = currentSelection();
      const state = clientStore.getSnapshot().humanInbox;
      if (selection?.kind !== 'inbox' || state.nextCursor === undefined) return Promise.resolve();
      return loadHumanInboxFor(state.category, selection, state.nextCursor);
    },
    openChannel(channelId) {
      return openChannelById(channelId);
    },
    markRead(channelId, messageId) {
      return markReadPosition(call, channelId, messageId);
    },
    async loadOlder(channelId) {
      const snapshot = clientStore.getSnapshot();
      const timeline = snapshot.conversation.timeline;
      if (
        snapshot.conversation.channel?.id !== channelId ||
        !timeline.hasOlder ||
        timeline.olderCursor === null ||
        timeline.loadingOlder
      )
        return;
      clientStore.setConversation({
        timeline: { ...timeline, loadingOlder: true, olderError: undefined },
      });
      try {
        const { page } = await loadTimelinePage(call, channelId, {
          direction: 'older',
          cursor: timeline.olderCursor,
        });
        const latest = clientStore.getSnapshot();
        if (
          latest.conversation.channel?.id !== channelId ||
          !latest.conversation.timeline.loadingOlder ||
          latest.conversation.timeline.olderCursor !== timeline.olderCursor
        )
          return;
        const pageIds = new Set(page.entries.map((entry) => entry.id));
        clientStore.setConversation({
          messages: [
            ...page.entries,
            ...latest.conversation.messages.filter((entry) => !pageIds.has(entry.id)),
          ],
          timeline: {
            ...latest.conversation.timeline,
            olderCursor: page.olderCursor,
            hasOlder: page.hasOlder,
            loadingOlder: false,
            olderError: undefined,
          },
        });
      } catch (error) {
        const latest = clientStore.getSnapshot();
        if (
          latest.conversation.channel?.id !== channelId ||
          !latest.conversation.timeline.loadingOlder ||
          latest.conversation.timeline.olderCursor !== timeline.olderCursor
        )
          return;
        clientStore.setConversation({
          timeline: {
            ...latest.conversation.timeline,
            loadingOlder: false,
            olderError: errorMessage(error),
          },
        });
      }
    },
    async loadNewer(channelId) {
      const snapshot = clientStore.getSnapshot();
      const timeline = snapshot.conversation.timeline;
      if (
        snapshot.conversation.channel?.id !== channelId ||
        !timeline.hasNewer ||
        timeline.newerCursor === null ||
        timeline.loadingNewer
      )
        return;
      clientStore.setConversation({
        timeline: { ...timeline, loadingNewer: true, newerError: undefined },
      });
      try {
        const { page, revision } = await loadTimelinePage(call, channelId, {
          direction: 'newer',
          cursor: timeline.newerCursor,
        });
        const latest = clientStore.getSnapshot();
        if (
          latest.conversation.channel?.id !== channelId ||
          !latest.conversation.timeline.loadingNewer ||
          latest.conversation.timeline.newerCursor !== timeline.newerCursor
        )
          return;
        const cursorDidNotAdvance =
          page.hasNewer && (page.newerCursor === null || page.newerCursor === timeline.newerCursor);
        const pageIds = new Set(page.entries.map((entry) => entry.id));
        const existing = latest.conversation.messages.filter((entry) => !pageIds.has(entry.id));
        const seen = new Set(existing.map((entry) => entry.id));
        const incoming = page.entries.filter((entry) => !seen.has(entry.id));
        const failures = remainingFailures(channelId, page.entries);
        clientStore.setConversation({
          messages: [...existing, ...incoming, ...(page.hasNewer ? [] : failures)].filter(
            (entry, index, entries) =>
              entries.findIndex((candidate) => candidate.id === entry.id) === index,
          ),
          revision: Math.max(revision, latest.conversation.revision),
          timeline: {
            ...latest.conversation.timeline,
            newerCursor: cursorDidNotAdvance
              ? latest.conversation.timeline.newerCursor
              : (page.newerCursor ?? latest.conversation.timeline.newerCursor),
            hasNewer: cursorDidNotAdvance ? false : page.hasNewer,
            loadingNewer: false,
            newerError: cursorDidNotAdvance ? 'Timeline newer cursor did not advance' : undefined,
          },
        });
      } catch (error) {
        const latest = clientStore.getSnapshot();
        if (
          latest.conversation.channel?.id !== channelId ||
          !latest.conversation.timeline.loadingNewer ||
          latest.conversation.timeline.newerCursor !== timeline.newerCursor
        )
          return;
        clientStore.setConversation({
          timeline: {
            ...latest.conversation.timeline,
            loadingNewer: false,
            newerError: errorMessage(error),
          },
        });
      }
    },
    async openLatest(channelId) {
      const { page, revision } = await loadTimelinePage(call, channelId);
      if (clientStore.getSnapshot().conversation.channel?.id !== channelId) return;
      clientStore.setConversation({
        messages: [...page.entries, ...remainingFailures(channelId, page.entries)],
        revision,
        timeline: { ...initialTimeline(), ...page },
        focusMessageId: undefined,
        error: undefined,
      });
    },
    async openAround(channelId, messageId) {
      try {
        const { page, revision } = await loadTimelinePage(call, channelId, {
          direction: 'around',
          around: messageId,
        });
        if (clientStore.getSnapshot().conversation.channel?.id !== channelId) return;
        clientStore.setConversation({
          messages: page.entries,
          revision,
          timeline: { ...initialTimeline(), ...page },
          focusMessageId: messageId,
          error: undefined,
        });
      } catch (error) {
        if (clientStore.getSnapshot().conversation.channel?.id !== channelId) return;
        clientStore.setConversation({ error: errorMessage(error) });
      }
    },
    async refreshChannelMessages(channelId) {
      const { page, revision } = await loadTimelinePage(call, channelId);
      const snapshot = clientStore.getSnapshot();
      if (snapshot.conversation.channel?.id !== channelId) return;
      if (revision < snapshot.conversation.revision) return;
      if (snapshot.conversation.timeline.hasNewer) {
        // This window is intentionally away from the tail; a reconnect must
        // not stitch a latest page across an unobserved gap.
        clientStore.setConversation({ revision });
        return;
      }
      const merged = mergeLatestWindow(snapshot.conversation.messages, page.entries);
      clientStore.setConversation({
        messages: merged.messages,
        revision,
        timeline: {
          ...snapshot.conversation.timeline,
          olderCursor: merged.keptPrefix
            ? snapshot.conversation.timeline.olderCursor
            : page.olderCursor,
          newerCursor: page.newerCursor,
          hasOlder: merged.keptPrefix ? snapshot.conversation.timeline.hasOlder : page.hasOlder,
          hasNewer: page.hasNewer,
        },
      });
    },
    memorySnapshot: (channelId) => loadMemorySnapshot(call, channelId),
    memoryFile: (channelId, path) => loadMemoryFile(call, channelId, path),
    memoryHistory: (channelId) => loadMemoryHistory(call, channelId),
    memoryDiff: (channelId, sha) => loadMemoryDiff(call, channelId, sha),
    memoryGitGraph: (channelId, offset) => loadMemoryGitGraph(call, channelId, offset),
    memoryGitCommitDiff: (channelId, sha) => loadMemoryGitCommitDiff(call, channelId, sha),
    memorySave: (input) => saveMemoryFile(call, input),
    memoryRepair: (input) => repairMemory(call, input),
    async openAssignment(sessionId) {
      const selection = currentSelection();
      const slug = selectedBotSlug(selection);
      if (selection === undefined || slug === undefined) return;
      try {
        const assignment = await loadAssignment(call, slug, sessionId);
        if (currentSelection() !== selection) return;
        clientStore.setAssignments({ selected: assignment, error: undefined });
      } catch (error) {
        if (currentSelection() !== selection) return;
        clientStore.setAssignments({ error: errorMessage(error) });
      }
    },
    async send(body, replyTo, attachments, memorySwitchTarget, mentions, channelRefs) {
      let snapshot = clientStore.getSnapshot();
      const channel = snapshot.conversation.channel;
      const text = body.trim();
      if (
        channel === undefined ||
        (text.length === 0 && !attachments?.length) ||
        snapshot.conversation.sending
      )
        return false;
      const replyTarget = snapshot.conversation.messages.find((message) => message.id === replyTo);
      if (snapshot.conversation.timeline.hasNewer) {
        try {
          const { page, revision } = await loadTimelinePage(call, channel.id);
          if (clientStore.getSnapshot().conversation.channel?.id !== channel.id) return false;
          clientStore.setConversation({
            messages: [...page.entries, ...remainingFailures(channel.id, page.entries)],
            revision,
            timeline: { ...initialTimeline(), ...page },
            focusMessageId: undefined,
          });
          snapshot = clientStore.getSnapshot();
        } catch (error) {
          if (clientStore.getSnapshot().conversation.channel?.id === channel.id) {
            clientStore.setConversation({ error: errorMessage(error) });
          }
          return false;
        }
      }
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
            ...(attachments === undefined ? {} : { attachments }),
            ...(mentions === undefined ? {} : { mentions }),
            ...(channelRefs === undefined ? {} : { channelRefs }),
            ...(replyTo === undefined
              ? {}
              : {
                  replyTo,
                  replyToPreview:
                    replyTarget === undefined
                      ? null
                      : { author: replyTarget.author, body: replyTarget.body },
                }),
            pending: true,
          },
        ],
      });
      const localEcho = clientStore
        .getSnapshot()
        .conversation.messages.find((message) => message.id === localId)!;
      try {
        const message = await sendChannelMessage(
          call,
          channel.id,
          text,
          replyTo,
          attachments,
          localId,
          undefined,
          memorySwitchTarget,
          mentions,
          channelRefs,
        );
        remainingFailures(channel.id, [message]);
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
        const slug = selectedBotSlug(selection);
        if (selection !== undefined && slug !== undefined) {
          void loadAssignments(call, slug)
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
        const latest = clientStore.getSnapshot();
        const matching =
          latest.conversation.channel?.id === channel.id
            ? latest.conversation.messages.find((message) => message.id === localId)
            : undefined;
        if (matching !== undefined && matching.pending !== true && matching.failed === undefined) {
          remainingFailures(channel.id, [matching]);
          clientStore.setConversation({ sending: false, error: undefined });
          return true;
        }
        if (
          error instanceof BridgeCallError &&
          error.code === 'invalid-input' &&
          error.message.includes('Mentioned PersonaBot')
        ) {
          if (latest.conversation.channel?.id === channel.id) {
            clientStore.setConversation({
              sending: false,
              error: error.message,
              messages: latest.conversation.messages.filter((message) => message.id !== localId),
            });
          }
          return false;
        }
        const failedEcho: ChannelMessage = {
          ...localEcho,
          pending: false,
          failed: errorMessage(error),
        };
        failedByChannel.set(channel.id, [
          ...localFailedFor(channel.id).filter((message) => message.id !== localId),
          failedEcho,
        ]);
        if (latest.conversation.channel?.id === channel.id) {
          clientStore.setConversation({
            sending: false,
            error: errorMessage(error),
            messages: latest.conversation.messages.some((message) => message.id === localId)
              ? latest.conversation.messages.map((message) =>
                  message.id === localId ? failedEcho : message,
                )
              : [...latest.conversation.messages, failedEcho],
          });
        }
        return false;
      }
    },
    dismissFailedMessage(channelId, messageId) {
      const conversation = clientStore.getSnapshot().conversation;
      if (conversation.channel?.id !== channelId) return false;
      const failed = conversation.messages.find(
        (message) => message.id === messageId && message.failed !== undefined,
      );
      if (failed === undefined) return false;
      failedByChannel.set(
        channelId,
        localFailedFor(channelId).filter((item) => item.id !== messageId),
      );
      clientStore.setConversation({
        messages: conversation.messages.filter((message) => message.id !== messageId),
        error: undefined,
      });
      return true;
    },
    async createBot(input, sectionId) {
      const bot = await createPersonaBot(call, input);
      const channel = await openDmChannel(call, bot.slug, bot.displayName);
      clientStore.upsertBot(bot);
      clientStore.upsertChannel(channel);
      await placeCreatedChannelFirst(channel.id, sectionId);
      await actions.openBot(bot.slug);
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
    async cancelGroupInvitation(channelId, invitationId) {
      try {
        const channel = await cancelGroupInvitation(call, channelId, invitationId);
        clientStore.upsertChannel(channel);
        if (clientStore.getSnapshot().conversation.channel?.id === channelId)
          clientStore.setConversation({ channel });
        return true;
      } catch (error) {
        console.warn('botharness: Group invitation cancellation failed', error);
        return false;
      }
    },
    async decideGroupJoin(channelId, requestId, accept) {
      try {
        const channel = await decideGroupJoin(call, channelId, requestId, accept);
        clientStore.upsertChannel(channel);
        if (clientStore.getSnapshot().conversation.channel?.id === channelId)
          clientStore.setConversation({ channel });
        return true;
      } catch (error) {
        console.warn('botharness: Group join decision failed', error);
        return false;
      }
    },
    async removeGroupMember(channelId, botSlug) {
      try {
        const channel = await removeGroupMember(call, channelId, botSlug);
        clientStore.upsertChannel(channel);
        if (clientStore.getSnapshot().conversation.channel?.id === channelId)
          clientStore.setConversation({ channel });
        return true;
      } catch (error) {
        console.warn('botharness: Group member removal failed', error);
        return false;
      }
    },
    async setGroupWakePolicy(channelId, botSlug, policy) {
      try {
        const channel = await setGroupWakePolicy(call, channelId, botSlug, policy);
        clientStore.upsertChannel(channel);
        if (clientStore.getSnapshot().conversation.channel?.id === channelId)
          clientStore.setConversation({ channel });
        return true;
      } catch (error) {
        console.warn('botharness: Group wake policy update failed', error);
        return false;
      }
    },
    async deleteGroupChannel(channelId) {
      try {
        await deleteGroupChannel(call, channelId);
      } catch (error) {
        console.warn('botharness: Group deletion failed', error);
        return false;
      }
      const snapshot = clientStore.getSnapshot();
      if (snapshot.conversation.channel?.id === channelId) clientStore.select(undefined);
      clientStore.setRoster(
        snapshot.bots,
        snapshot.channels.filter((channel) => channel.id !== channelId),
      );
      try {
        await actions.load();
      } catch (error) {
        console.warn('botharness: Group deletion refresh failed', error);
      }
      return true;
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
    async reorderPinnedChannels(order, beforePublish) {
      const snapshot = clientStore.getSnapshot();
      const current = resolvePinnedChannelIds(snapshot.channels, snapshot.roster.pins);
      const selected = new Set(order);
      if (
        order.length !== current.length ||
        selected.size !== current.length ||
        current.some((id) => !selected.has(id))
      ) {
        return false;
      }
      if (sameIds(order, current)) {
        beforePublish();
        return true;
      }
      try {
        await setRosterPins(call, [...order]);
        beforePublish();
        await refreshRoster();
        return true;
      } catch (error) {
        reportRosterFailure(error);
        await refreshRoster();
        return false;
      }
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
    async batchRoster(input) {
      try {
        const snapshot = await applyRosterBatch(call, input);
        clientStore.setRosterState({
          pins: snapshot.pins,
          hidden: snapshot.hidden,
          sections: snapshot.sections,
          topOrder: snapshot.topOrder,
          readOnly: false,
        });
        return true;
      } catch (error) {
        reportRosterFailure(error);
        await refreshRoster();
        return false;
      }
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
  return actions;
}
