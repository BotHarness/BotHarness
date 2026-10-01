import type { RosterConfig } from './roster-config.js';
import type { RosterSection, TopOrderEntry } from './roster.js';

export type ClientMode = 'dsh' | 'bot';

export type ClientStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface BotSummary {
  slug: string;
  displayName: string;
  roles: string[];
  description?: string;
  avatar?: string;
  paused?: boolean;
  aggregateState: string;
  workspaces: string[];
  createdAt: string;
}

export interface ChannelHumanMember {
  humanId: string;
  displayName: string;
}

export interface ChannelSummary {
  humanMembers?: ChannelHumanMember[];
  id: string;
  type: 'dm' | 'group';
  name: string;
  avatar?: string;
  members: string[];
  botSlug?: string;
  ownerBotSlug?: string;
  wakePolicies?: Record<
    string,
    {
      mode: 'all' | 'mentions' | 'digest' | 'silent';
      count: number;
      intervalSeconds: number;
      revision: number;
    }
  >;
  joinRequests?: Array<{
    id: string;
    requesterBotSlug: string;
    status: 'pending' | 'accepted' | 'declined' | 'cancelled';
    createdAt: string;
    decidedAt?: string;
    decidedBy?: string;
  }>;
  invitations?: Array<{
    id: string;
    targetBotSlug: string;
    inviterBotSlug?: string;
    inviterHuman?: true;
    status: 'pending' | 'accepted' | 'declined' | 'cancelled';
    createdAt: string;
    respondedAt?: string;
  }>;
  createdAt: string;
  updatedAt: string;
  latestMessage?: ChannelMessage;
}

export type ChannelAuthor =
  | { kind: 'human' }
  | { kind: 'bot'; slug: string }
  | { kind: 'bridged'; source: string }
  | { kind: 'system' };

export interface ChannelReplyPreview {
  author: ChannelAuthor;
  body: string;
}

export type ChannelAttachmentRef = { name: string; mime: string; size: number } & (
  | { fileId: string; hash?: never }
  | { hash: string; fileId?: never }
);

export interface ToolApprovalRequestCard {
  sessionId: string;
  callId: string;
  toolName: string;
  role: 'orchestrator' | 'assignment';
  cwd: string;
  input: string;
}

export interface ToolApprovalDecision {
  requestMessageId: string;
  outcome: 'allowed-once' | 'allowed-always-exact' | 'allowed-always-all' | 'rejected';
}

export interface UserQuestionOption {
  label: string;
  description?: string;
}

export interface UserQuestionItem {
  id: string;
  question: string;
  detail?: string;
  header?: string;
  options?: UserQuestionOption[];
  multiSelect?: boolean;
}

export interface UserQuestionAnswerItem {
  id: string;
  selected: string[];
  custom?: string;
}

export interface UserQuestionRequestCard {
  sessionId: string;
  questions: UserQuestionItem[];
}

export interface UserQuestionResolution {
  requestMessageId: string;
  state: 'answered' | 'cancelled';
  answers?: UserQuestionAnswerItem[];
}

export interface SessionFailureCard {
  role: 'orchestrator' | 'assignment';
  sessionId: string;
  code?: string;
  status?: number;
  detail: string;
  context?: string;
}

export interface ChannelMessage {
  id: string;
  at: string;
  author: ChannelAuthor;
  body: string;
  memorySwitchTarget?: string;
  mentions?: { botSlug: string; label: string; start: number; end: number }[];
  humanMentions?: { humanId: string; label: string; start: number; end: number }[];
  channelRefs?: { channelId: string; label: string; start: number; end: number }[];
  humanReceipts?: {
    humanId: string;
    displayName: string;
    state: 'unread' | 'read';
  }[];
  channelRevision?: number;
  deliveries?: {
    botSlug: string;
    state:
      | 'pending'
      | 'observed'
      | 'running'
      | 'retryable'
      | 'needs-repair'
      | 'handled'
      | 'ignored';
  }[];
  botDmAction?: { channelId: string; messageId: string; recipientBotSlug: string };
  memberDeparture?: {
    memberKind: 'bot' | 'human';
    memberId: string;
    displayName: string;
    departureType?: 'left' | 'removed';
  };
  grantRequest?: true;
  grantRequestResolution?: { requestMessageId: string; grantId: string };
  toolApprovalRequest?: ToolApprovalRequestCard;
  sessionFailure?: SessionFailureCard;
  toolApprovalDecision?: ToolApprovalDecision;
  userQuestionRequest?: UserQuestionRequestCard;
  userQuestionResolution?: UserQuestionResolution;
  attachments?: ChannelAttachmentRef[];
  format?: 'markdown' | 'text';
  replyTo?: string;
  replyToPreview?: ChannelReplyPreview | null;
  pending?: boolean;
  failed?: string;
  streaming?: boolean;
}

export interface ChannelDraft {
  channelId: string;
  draftId: string;
  attemptId: string;
  revision: number;
  botSlug: string;
  body: string;
}

export interface OwnedSessionSummary {
  sessionId: string;
  role: 'orchestrator' | 'assignment';
  createdAt: string;
  cwdReference?: string;
  assignmentActivity?: 'working' | 'idle' | 'error' | 'stopping' | 'stopped';
  assignmentAccessMode?: 'workspace-write' | 'danger-full-access';
}

export type HumanInboxCategory = 'action' | 'info' | 'unread' | 'replies';
export type HumanInboxSort = 'newest' | 'oldest';

export interface HumanInboxFilters {
  botSlug: string | undefined;
  channelId: string | undefined;
  sort: HumanInboxSort;
}

export interface HumanAttentionItem {
  id: string;
  category: HumanInboxCategory;
  kind:
    | 'group-join-request'
    | 'user-question'
    | 'tool-approval'
    | 'workspace-grant-request'
    | 'bot-dm-message'
    | 'assignment-waiting-human'
    | 'assignment-blocked'
    | 'assignment-report'
    | 'bot-message-needs-repair'
    | 'channel-unread'
    | 'channel-reply'
    | 'channel-mention';
  createdAt: string;
  channelId?: string;
  channelName?: string;
  botSlug: string;
  summary: string;
  requestId?: string;
  messageId?: string;
  assignmentSessionId?: string;
  sourceEventId?: string;
  unreadCount?: number;
  isUnread?: boolean;
}

export interface HumanAttentionPage {
  items: HumanAttentionItem[];
  nextCursor?: string;
}

export interface HumanInboxState {
  status: ClientStatus;
  unreadCount: number;
  hasAction: boolean;
  category: HumanInboxCategory;
  botSlug: string | undefined;
  channelId: string | undefined;
  sort: HumanInboxSort;
  items: readonly HumanAttentionItem[];
  nextCursor: string | undefined;
  error: string | undefined;
}
export type ConversationSelection =
  | { kind: 'bot'; slug: string }
  | { kind: 'channel'; channelId: string }
  | { kind: 'inbox' };

export interface ConversationTimeline {
  olderCursor: string | null;
  newerCursor: string | null;
  hasOlder: boolean;
  hasNewer: boolean;
  loadingOlder: boolean;
  olderError: string | undefined;
  loadingNewer: boolean;
  newerError: string | undefined;
}

export function initialTimeline(): ConversationTimeline {
  return {
    olderCursor: null,
    newerCursor: null,
    hasOlder: false,
    hasNewer: false,
    loadingOlder: false,
    olderError: undefined,
    loadingNewer: false,
    newerError: undefined,
  };
}
export interface ConversationState {
  status: ClientStatus;
  channel: ChannelSummary | undefined;
  messages: readonly ChannelMessage[];
  drafts: readonly ChannelDraft[];
  draftRevision: number;
  draftNotice: 'interrupted' | 'expired' | undefined;
  revision: number;
  timeline: ConversationTimeline;
  focusMessageId?: string | undefined;
  error: string | undefined;
  sending: boolean;
}

export type BotAttentionStatus =
  | 'pending'
  | 'processing'
  | 'observed'
  | 'deferred'
  | 'needs-repair'
  | 'handled'
  | 'ignored';

export interface BotAttentionItem {
  id: string;
  botSlug: string;
  reason: string;
  state: BotAttentionStatus;
  createdAt: string;
  observedAt?: string;
  handledAt?: string;
  ignoredAt?: string;
  sourceKind: string;
  sourceChannelId?: string;
  sourceChannelName?: string;
  sourceMessageId?: string;
  assignmentSessionId?: string;
  assignmentPurpose?: string;
  assignmentReportState?: 'progress' | 'completed' | 'blocked' | 'waiting-human' | 'failed';
  sourceAvailable: boolean;
  authorKind: 'human' | 'bot' | 'bridged' | 'system';
  authorBotSlug?: string;
  summary: string;
}

export interface BotAttentionPage {
  items: BotAttentionItem[];
  nextCursor?: string;
}

export interface BotInboxState {
  status: ClientStatus;
  items: readonly BotAttentionItem[];
  nextCursor: string | undefined;
  error: string | undefined;
}

export interface SessionsState {
  status: ClientStatus;
  items: readonly OwnedSessionSummary[];
  error: string | undefined;
}

export interface RosterState {
  pins: readonly string[];
  hidden: readonly string[];
  sections: readonly RosterSection[];
  topOrder: readonly TopOrderEntry[] | undefined;
  readOnly: boolean;
}

export interface ClientState {
  mode: ClientMode;
  bots: readonly BotSummary[];
  channels: readonly ChannelSummary[];
  status: ClientStatus;
  error: string | undefined;
  query: string;
  config: RosterConfig;
  roster: RosterState;
  selection: ConversationSelection | undefined;
  conversation: ConversationState;
  sessions: SessionsState;
  botInbox: BotInboxState;
  humanInbox: HumanInboxState;
}

export interface ClientStore {
  getSnapshot(): ClientState;
  subscribe(listener: () => void): () => void;
  setMode(mode: ClientMode): void;
  setQuery(query: string): void;
  setConfig(config: RosterConfig): void;
  setRosterStatus(status: ClientStatus, error: string | undefined): void;
  setRoster(bots: readonly BotSummary[], channels: readonly ChannelSummary[]): void;
  upsertBot(bot: BotSummary): void;
  setRosterState(patch: Partial<RosterState>): void;
  upsertChannel(channel: ChannelSummary): void;
  select(
    selection: ConversationSelection | undefined,
    options?: { deferConversation?: boolean },
  ): void;
  setConversation(patch: Partial<ConversationState>): void;
  updateCachedConversation(
    channelId: string,
    update: (cached: ConversationState) => ConversationState,
  ): void;
  setSessions(patch: Partial<SessionsState>): void;
  setBotInbox(patch: Partial<BotInboxState>): void;
  setHumanInbox(patch: Partial<HumanInboxState>): void;
}

function initialConversation(): ConversationState {
  return {
    status: 'idle',
    channel: undefined,
    messages: [],
    drafts: [],
    draftRevision: 0,
    draftNotice: undefined,
    revision: 0,
    timeline: initialTimeline(),
    focusMessageId: undefined,
    error: undefined,
    sending: false,
  };
}

function initialSessions(): SessionsState {
  return { status: 'idle', items: [], error: undefined };
}

function initialBotInbox(): BotInboxState {
  return { status: 'idle', items: [], nextCursor: undefined, error: undefined };
}

function initialHumanInbox(): HumanInboxState {
  return {
    status: 'idle',
    unreadCount: 0,
    hasAction: false,
    category: 'action',
    botSlug: undefined,
    channelId: undefined,
    sort: 'newest',
    items: [],
    nextCursor: undefined,
    error: undefined,
  };
}

function initialRoster(): RosterState {
  return {
    pins: [],
    hidden: [],
    sections: [],
    topOrder: undefined,
    readOnly: false,
  };
}

function sameSelection(
  left: ConversationSelection | undefined,
  right: ConversationSelection | undefined,
): boolean {
  if (left === right) return true;
  if (left === undefined || right === undefined) return false;
  if (left.kind === 'inbox' && right.kind === 'inbox') return true;
  if (left.kind === 'bot' && right.kind === 'bot') return left.slug === right.slug;
  if (left.kind === 'channel' && right.kind === 'channel')
    return left.channelId === right.channelId;
  return false;
}

export function createStore(): ClientStore {
  const conversations = new Map<string, ConversationState>();
  const botChannels = new Map<string, string>();
  const sessionsByBot = new Map<string, SessionsState>();
  const inboxesByBot = new Map<string, BotInboxState>();
  const rememberKeyed = <T>(cache: Map<string, T>, key: string, value: T): void => {
    cache.delete(key);
    cache.set(key, value);
    if (cache.size > 30) cache.delete(cache.keys().next().value!);
  };
  const rememberConversation = (): void => {
    const conversation = state.conversation;
    const channelId = conversation.channel?.id;
    if (channelId === undefined || conversation.status !== 'ready') return;
    rememberKeyed(conversations, channelId, {
      ...conversation,
      drafts: [],
      draftRevision: 0,
      draftNotice: undefined,
      error: undefined,
      sending: false,
      timeline: {
        ...conversation.timeline,
        loadingOlder: false,
        olderError: undefined,
        loadingNewer: false,
        newerError: undefined,
      },
    });
    if (state.selection?.kind === 'bot')
      rememberKeyed(botChannels, state.selection.slug, channelId);
  };
  const botSlugForSelection = (selection: ConversationSelection | undefined): string | undefined =>
    selection?.kind === 'bot'
      ? selection.slug
      : selection?.kind === 'channel'
        ? state.channels.find((channel) => channel.id === selection.channelId)?.botSlug
        : undefined;
  const cachedChannelId = (selection: ConversationSelection | undefined): string | undefined =>
    selection?.kind === 'channel'
      ? selection.channelId
      : selection?.kind === 'bot'
        ? (state.channels.find(
            (channel) => channel.type === 'dm' && channel.botSlug === selection.slug,
          )?.id ?? botChannels.get(selection.slug))
        : undefined;
  let state: ClientState = {
    mode: 'dsh',
    bots: [],
    channels: [],
    status: 'idle',
    error: undefined,
    query: '',
    config: { collapsed: {} },
    roster: initialRoster(),
    selection: undefined,
    conversation: initialConversation(),
    sessions: initialSessions(),
    botInbox: initialBotInbox(),
    humanInbox: initialHumanInbox(),
  };
  const listeners = new Set<() => void>();

  const update = (patch: Partial<ClientState>): void => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setMode(mode) {
      if (state.mode !== mode) update({ mode });
    },
    setQuery(query) {
      if (state.query !== query) update({ query });
    },
    setConfig(config) {
      update({ config });
    },
    setRosterStatus(status, error) {
      update({ status, error });
    },
    setRoster(bots, channels) {
      update({ bots, channels, status: 'ready', error: undefined });
    },
    upsertBot(bot) {
      const existing = state.bots.filter((candidate) => candidate.slug !== bot.slug);
      update({ bots: [bot, ...existing], status: 'ready', error: undefined });
    },
    setRosterState(patch) {
      update({ roster: { ...state.roster, ...patch } });
    },
    upsertChannel(channel) {
      const previous = state.channels.find((candidate) => candidate.id === channel.id);
      const existing = state.channels.filter((candidate) => candidate.id !== channel.id);
      update({ channels: [{ ...previous, ...channel }, ...existing] });
    },
    select(selection, options) {
      if (sameSelection(state.selection, selection)) return;
      rememberConversation();
      const previousBot = botSlugForSelection(state.selection);
      if (previousBot !== undefined) {
        if (state.sessions.status === 'ready')
          rememberKeyed(sessionsByBot, previousBot, state.sessions);
        if (state.botInbox.status === 'ready')
          rememberKeyed(inboxesByBot, previousBot, state.botInbox);
      }
      const channelId = cachedChannelId(selection);
      const botSlug = botSlugForSelection(selection);
      const cached = channelId === undefined ? undefined : conversations.get(channelId);
      const channel = state.channels.find((candidate) => candidate.id === channelId);
      update({
        selection,
        conversation:
          cached === undefined || options?.deferConversation === true
            ? selection?.kind === 'channel' || selection?.kind === 'bot'
              ? { ...initialConversation(), status: 'loading', channel }
              : initialConversation()
            : { ...cached, channel: channel ?? cached.channel },
        sessions:
          (botSlug === undefined ? undefined : sessionsByBot.get(botSlug)) ?? initialSessions(),
        botInbox:
          (botSlug === undefined ? undefined : inboxesByBot.get(botSlug)) ?? initialBotInbox(),
        humanInbox: initialHumanInbox(),
      });
    },
    setConversation(patch) {
      update({ conversation: { ...state.conversation, ...patch } });
    },
    updateCachedConversation(channelId, apply) {
      const cached = conversations.get(channelId);
      if (cached !== undefined) conversations.set(channelId, apply(cached));
    },
    setSessions(patch) {
      update({ sessions: { ...state.sessions, ...patch } });
    },
    setBotInbox(patch) {
      update({ botInbox: { ...state.botInbox, ...patch } });
    },
    setHumanInbox(patch) {
      update({ humanInbox: { ...state.humanInbox, ...patch } });
    },
  };
}

export const store = createStore();
