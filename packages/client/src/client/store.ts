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

export interface ChannelSummary {
  id: string;
  type: 'dm' | 'group';
  name: string;
  members: string[];
  botSlug?: string;
  ownerBotSlug?: string;
  wakePolicies?: Record<
    string,
    { mode: 'mentions' | 'digest'; count: number; intervalSeconds: number; revision: number }
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
    inviterBotSlug: string;
    status: 'pending' | 'accepted' | 'declined' | 'cancelled';
    createdAt: string;
    respondedAt?: string;
  }>;
  createdAt: string;
  updatedAt: string;
  /** Latest durable message projected by the Channel list query for compact previews. */
  latestMessage?: ChannelMessage;
}

export type ChannelAuthor =
  | { kind: 'human' }
  | { kind: 'bot'; slug: string }
  | { kind: 'bridged'; source: string };

export interface ChannelReplyPreview {
  author: ChannelAuthor;
  body: string;
}

export interface ChannelAttachmentRef {
  hash: string;
  name: string;
  mime: string;
  size: number;
}

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
  channelRefs?: { channelId: string; label: string; start: number; end: number }[];
  deliveries?: {
    botSlug: string;
    state: 'pending' | 'running' | 'retryable' | 'needs-repair' | 'handled';
  }[];
  /** Bodyless Human DM activity linking to a committed Bot-to-Bot send. */
  botDmAction?: { channelId: string; messageId: string; recipientBotSlug: string };
  grantRequest?: true;
  toolApprovalRequest?: ToolApprovalRequestCard;
  sessionFailure?: SessionFailureCard;
  toolApprovalDecision?: ToolApprovalDecision;
  userQuestionRequest?: UserQuestionRequestCard;
  userQuestionResolution?: UserQuestionResolution;
  attachments?: ChannelAttachmentRef[];
  format?: 'markdown' | 'text';
  replyTo?: string;
  replyToPreview?: ChannelReplyPreview | null;
  /** Local echo awaiting the Host's committed message; never sent on the wire. */
  pending?: boolean;
  /** Process-local rejected send. Never a committed Source Event. */
  failed?: string;
  /** Local projection of a process-only Orchestrator tool-call draft. */
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

export interface SessionSummary {
  id: string;
  title: string;
  cwd: string;
  updatedAt: string;
}

export type AssignmentActivity = 'working' | 'idle' | 'error' | 'stopping' | 'stopped';
export type AssignmentReportState = 'completed' | 'blocked' | 'waiting-human' | 'failed';

export interface AssignmentReport {
  state: AssignmentReportState;
  summary: string;
  at: string;
}

export interface AssignmentSummary {
  sessionId: string;
  purpose: string;
  activity: AssignmentActivity;
  latestReport?: AssignmentReport;
  permission?: {
    grantId: string;
    workspaceId: string;
    primaryCwd: string;
    mode: 'workspace-write' | 'danger-full-access';
    approval: 'ask' | 'never';
    presetRevision: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface AssignmentDetail extends AssignmentSummary {
  botSlug: string;
  sourceEventId: string;
}

export type HumanInboxCategory = 'action' | 'info';

export interface HumanAttentionItem {
  id: string;
  category: HumanInboxCategory;
  kind: 'group-join-request' | 'bot-dm-message';
  createdAt: string;
  channelId: string;
  channelName: string;
  botSlug: string;
  summary: string;
  requestId?: string;
  messageId?: string;
}

export interface HumanAttentionPage {
  items: HumanAttentionItem[];
  nextCursor?: string;
}

export interface HumanInboxState {
  status: ClientStatus;
  category: HumanInboxCategory;
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
  /** Process-local, presentation-only Orchestrator channel_send previews. */
  drafts: readonly ChannelDraft[];
  /** Process-local draft event watermark; reset on a new SSE baseline. */
  draftRevision: number;
  draftNotice: 'interrupted' | 'expired' | undefined;
  /** Durable per-Channel live-stream watermark. */
  revision: number;
  timeline: ConversationTimeline;
  focusMessageId?: string | undefined;
  error: string | undefined;
  sending: boolean;
}

export type BotAttentionStatus = 'pending' | 'observed' | 'deferred' | 'needs-repair' | 'handled';

export interface BotAttentionItem {
  id: string;
  botSlug: string;
  reason: string;
  state: BotAttentionStatus;
  createdAt: string;
  observedAt?: string;
  handledAt?: string;
  sourceKind: string;
  sourceChannelId?: string;
  sourceChannelName?: string;
  sourceMessageId?: string;
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

export interface AssignmentsState {
  status: ClientStatus;
  items: readonly AssignmentSummary[];
  selected: AssignmentDetail | undefined;
  error: string | undefined;
}

/** Host-owned arrangement mirrored from `rosterGet`; never written locally. */
export interface RosterState {
  /** Pinned Channel ids in display order. */
  pins: readonly string[];
  /** Channel ids hidden from expanded and collapsed roster navigation. */
  hidden: readonly string[];
  sections: readonly RosterSection[];
  /**
   * Flat top-level order, or `undefined` when the host domain predates the
   * flat remodel (legacy fallback, converted once on load).
   */
  topOrder: readonly TopOrderEntry[] | undefined;
  /** True while the host reports `storage-unavailable`; the UI stays read-only. */
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
  assignments: AssignmentsState;
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
  select(selection: ConversationSelection | undefined): void;
  setConversation(patch: Partial<ConversationState>): void;
  setAssignments(patch: Partial<AssignmentsState>): void;
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

function initialAssignments(): AssignmentsState {
  return { status: 'idle', items: [], selected: undefined, error: undefined };
}

function initialBotInbox(): BotInboxState {
  return { status: 'idle', items: [], nextCursor: undefined, error: undefined };
}

function initialHumanInbox(): HumanInboxState {
  return { status: 'idle', category: 'action', items: [], nextCursor: undefined, error: undefined };
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
    assignments: initialAssignments(),
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
    select(selection) {
      if (sameSelection(state.selection, selection)) return;
      update({
        selection,
        conversation: initialConversation(),
        assignments: initialAssignments(),
        botInbox: initialBotInbox(),
        humanInbox: initialHumanInbox(),
      });
    },
    setConversation(patch) {
      update({ conversation: { ...state.conversation, ...patch } });
    },
    setAssignments(patch) {
      update({ assignments: { ...state.assignments, ...patch } });
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
