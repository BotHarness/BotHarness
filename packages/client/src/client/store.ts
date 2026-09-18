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

export interface ClientState {
  mode: ClientMode;
  bots: readonly BotSummary[];
  status: ClientStatus;
  error: string | undefined;
  selectedSlug: string | undefined;
  query: string;
}

export type BotLoader = (signal?: AbortSignal) => Promise<readonly BotSummary[]>;

const INITIAL_STATE: ClientState = {
  mode: 'dsh',
  bots: [],
  status: 'idle',
  error: undefined,
  selectedSlug: undefined,
  query: '',
};

let state: ClientState = INITIAL_STATE;
const listeners = new Set<() => void>();

function update(patch: Partial<ClientState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export const store = {
  getSnapshot: (): ClientState => state,
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  setMode: (mode: ClientMode): void => {
    if (state.mode !== mode) update({ mode });
  },
  setQuery: (query: string): void => {
    if (state.query !== query) update({ query });
  },
  select: (selectedSlug: string | undefined): void => {
    if (state.selectedSlug !== selectedSlug) update({ selectedSlug });
  },
  load: async (loader: BotLoader, signal?: AbortSignal): Promise<void> => {
    update({ status: 'loading', error: undefined });
    try {
      const bots = await loader(signal);
      const selected = bots.some((bot) => bot.slug === state.selectedSlug)
        ? state.selectedSlug
        : undefined;
      update({ bots, status: 'ready', error: undefined, selectedSlug: selected });
    } catch (error: unknown) {
      if (signal?.aborted === true) return;
      update({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};
