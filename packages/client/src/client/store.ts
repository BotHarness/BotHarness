import type { RosterConfig } from './roster-config.js';

export type ClientMode = 'dsh' | 'bot';

export type ClientStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface BotSummary {
  slug: string;
  displayName: string;
  tag?: string;
  description?: string;
  avatar?: string;
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
  createdAt: string;
  updatedAt: string;
}

export type ChannelAuthor =
  | { kind: 'human' }
  | { kind: 'bot'; slug: string }
  | { kind: 'bridged'; source: string };

export interface ChannelMessage {
  id: string;
  at: string;
  author: ChannelAuthor;
  body: string;
}

export interface SessionSummary {
  id: string;
  title: string;
  cwd: string;
  updatedAt: string;
}

export type ConversationSelection =
  | { kind: 'bot'; slug: string }
  | { kind: 'channel'; channelId: string };

export interface ConversationState {
  status: ClientStatus;
  channel: ChannelSummary | undefined;
  messages: readonly ChannelMessage[];
  error: string | undefined;
  sending: boolean;
}

export interface SessionsState {
  status: ClientStatus;
  items: readonly SessionSummary[];
  error: string | undefined;
}

export interface ClientState {
  mode: ClientMode;
  bots: readonly BotSummary[];
  channels: readonly ChannelSummary[];
  status: ClientStatus;
  error: string | undefined;
  query: string;
  config: RosterConfig;
  selection: ConversationSelection | undefined;
  conversation: ConversationState;
  sessions: SessionsState;
}

export interface ClientStore {
  getSnapshot(): ClientState;
  subscribe(listener: () => void): () => void;
  setMode(mode: ClientMode): void;
  setQuery(query: string): void;
  setConfig(config: RosterConfig): void;
  setRosterStatus(status: ClientStatus, error: string | undefined): void;
  setRoster(bots: readonly BotSummary[], channels: readonly ChannelSummary[]): void;
  upsertChannel(channel: ChannelSummary): void;
  select(selection: ConversationSelection | undefined): void;
  setConversation(patch: Partial<ConversationState>): void;
  setSessions(patch: Partial<SessionsState>): void;
}

function initialConversation(): ConversationState {
  return {
    status: 'idle',
    channel: undefined,
    messages: [],
    error: undefined,
    sending: false,
  };
}

function initialSessions(): SessionsState {
  return { status: 'idle', items: [], error: undefined };
}

function sameSelection(
  left: ConversationSelection | undefined,
  right: ConversationSelection | undefined,
): boolean {
  if (left === right) return true;
  if (left === undefined || right === undefined) return false;
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
    config: { pins: [], sections: [], sortMode: 'auto' },
    selection: undefined,
    conversation: initialConversation(),
    sessions: initialSessions(),
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
    upsertChannel(channel) {
      const existing = state.channels.filter((candidate) => candidate.id !== channel.id);
      update({ channels: [channel, ...existing] });
    },
    select(selection) {
      if (sameSelection(state.selection, selection)) return;
      update({ selection, conversation: initialConversation(), sessions: initialSessions() });
    },
    setConversation(patch) {
      update({ conversation: { ...state.conversation, ...patch } });
    },
    setSessions(patch) {
      update({ sessions: { ...state.sessions, ...patch } });
    },
  };
}

export const store = createStore();
