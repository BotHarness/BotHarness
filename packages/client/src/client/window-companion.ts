import type { CompanionBot, CompanionMessage } from '../../../core/src/companions/feed.js';
import {
  isAvatarAppearance,
  isRetainedAvatarAppearance,
} from '../../../core/src/bots/avatar-appearance.js';
import { parseActivitySnapshot } from './activity-live.js';
import type { PersonaBotActivitySnapshot } from './store.js';
import type { ConfigStorage } from './roster-config.js';

export interface CompanionSelection {
  botId: string;
  activity: boolean;
  dm: boolean;
  group: boolean;
  visibility: 'shared';
  walking: boolean;
  position: number;
}
export interface CompanionCard extends CompanionMessage {
  shown: number;
  remaining: number;
}
export interface CompanionViewState {
  ready: boolean;
  selection?: CompanionSelection | undefined;
  bot?: CompanionBot | undefined;
  activity?: PersonaBotActivitySnapshot['bots'][number] | undefined;
  sync: 'connecting' | 'live' | 'stale';
  cards: readonly CompanionCard[];
  pending: number;
  reading: boolean;
}
interface CompanionStream {
  addEventListener(name: string, listener: (event: Event) => void): void;
  close(): void;
}
interface CompanionDependencies {
  onActivity?(snapshot: PersonaBotActivitySnapshot): void;
  storage?: ConfigStorage | undefined;
  context(): Promise<{ profileId: string }>;
  source(url: string): CompanionStream;
}
const object = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
function decode(event: Event): Record<string, unknown> | undefined {
  if (!(event instanceof MessageEvent) || typeof event.data !== 'string') return undefined;
  try {
    return object(JSON.parse(event.data));
  } catch {
    return undefined;
  }
}

export class WindowCompanion {
  private state: CompanionViewState = {
    ready: false,
    sync: 'connecting',
    cards: [],
    pending: 0,
    reading: false,
  };
  private listeners = new Set<() => void>();
  private stream: CompanionStream | undefined;
  private profileId: string | undefined;
  private generation: string | undefined;
  private pendingCards: CompanionCard[] = [];
  private seen: string[] = [];
  private disposed = false;
  constructor(private readonly deps: CompanionDependencies) {}
  getSnapshot = (): CompanionViewState => this.state;
  subscribe = (changed: () => void): (() => void) => {
    this.listeners.add(changed);
    return () => {
      this.listeners.delete(changed);
    };
  };
  private update(value: Partial<CompanionViewState>): void {
    this.state = { ...this.state, ...value };
    for (const changed of this.listeners) changed();
  }
  private get key(): string {
    return `botharness/companions/v1/${this.profileId}`;
  }
  async start(): Promise<void> {
    try {
      const { profileId } = await this.deps.context();
      if (this.disposed || !profileId) return;
      this.profileId = profileId;
      let selection: CompanionSelection | undefined;
      try {
        const raw = this.deps.storage?.getItem(this.key);
        const value = raw ? object(JSON.parse(raw)) : undefined;
        if (typeof value?.['botId'] === 'string' && value['botId'].length > 0)
          selection = {
            botId: value['botId'],
            activity: value['activity'] !== false,
            dm: value['dm'] !== false,
            group: value['group'] === true,
            visibility: 'shared',
            walking: value['walking'] !== false,
            position:
              typeof value['position'] === 'number' && Number.isFinite(value['position'])
                ? Math.max(0, Math.min(1, value['position']))
                : 0.75,
          };
      } catch {}
      this.update({ ready: true, selection });
      this.connect();
    } catch {
      if (!this.disposed) this.update({ sync: 'stale' });
    }
  }
  select(botId: string): void {
    if (!this.state.ready || this.disposed) return;
    this.update({
      selection: {
        botId,
        activity: true,
        dm: true,
        group: false,
        visibility: 'shared',
        walking: true,
        position: 0.75,
      },
      bot: undefined,
      activity: undefined,
      reading: false,
    });
    this.save();
    this.connect();
  }
  remove(): void {
    this.disconnect();
    this.update({
      selection: undefined,
      bot: undefined,
      activity: undefined,
      cards: [],
      pending: 0,
      reading: false,
    });
    this.save();
  }
  configure(
    change: Partial<Pick<CompanionSelection, 'walking' | 'activity' | 'dm' | 'position'>>,
  ): void {
    const selected = this.state.selection;
    if (!selected) return;
    this.update({ selection: { ...selected, ...change } });
    this.save();
    if (change.dm !== undefined && change.dm !== selected.dm) this.connect();
  }
  reading(reading: boolean): void {
    if (reading === this.state.reading) return;
    if (reading) this.update({ reading });
    else {
      const cards = [...this.state.cards, ...this.pendingCards].slice(-20);
      this.pendingCards = [];
      this.update({ reading, cards, pending: 0 });
    }
  }
  advance(milliseconds: number, reduced = false): void {
    if (
      this.disposed ||
      !Number.isFinite(milliseconds) ||
      milliseconds <= 0 ||
      !this.state.cards.length
    )
      return;
    const elapsed = Math.min(milliseconds, 30_000);
    const cards = this.state.cards.flatMap((card): CompanionCard[] => {
      if (card.shown < card.body.length) {
        const shown = reduced
          ? card.body.length
          : Math.min(card.body.length, card.shown + Math.max(1, Math.floor(elapsed / 35)));
        return [
          {
            ...card,
            shown,
            remaining:
              shown === card.body.length
                ? Math.max(3500, Math.min(20000, card.body.length * 45))
                : 0,
          },
        ];
      }
      const remaining = card.remaining - (this.state.reading ? 0 : elapsed);
      return remaining > 0 ? [{ ...card, remaining }] : [];
    });
    this.update({ cards });
  }
  dismiss(messageId: string): void {
    this.update({ cards: this.state.cards.filter((card) => card.messageId !== messageId) });
  }
  private save(): void {
    try {
      this.deps.storage?.setItem(this.key, JSON.stringify(this.state.selection ?? null));
    } catch {}
  }
  private disconnect(): void {
    this.stream?.close();
    this.stream = undefined;
    this.generation = undefined;
    this.seen = [];
    this.pendingCards = [];
  }
  private connect(): void {
    this.disconnect();
    this.update({ cards: [], pending: 0, sync: 'connecting' });
    const selection = this.state.selection;
    if (!selection || this.disposed) return;
    let stream: CompanionStream;
    try {
      stream = this.deps.source(
        `/api/botharness/companion?botId=${encodeURIComponent(selection.botId)}&dm=${selection.dm ? 1 : 0}`,
      );
    } catch {
      this.update({ sync: 'stale' });
      return;
    }
    this.stream = stream;
    const snapshot = (event: Event, baseline: boolean): void => {
      if (this.disposed || this.stream !== stream) return;
      const value = decode(event);
      const bot = object(value?.['bot']);
      const activity = parseActivitySnapshot(JSON.stringify(value?.['activity']));
      if (
        value?.['profileId'] !== this.profileId ||
        bot?.['slug'] !== selection.botId ||
        typeof bot['name'] !== 'string' ||
        typeof bot['paused'] !== 'boolean' ||
        activity === undefined
      )
        return;
      const appearance =
        isAvatarAppearance(bot['appearance']) || isRetainedAvatarAppearance(bot['appearance'])
          ? bot['appearance']
          : undefined;
      if (baseline || (this.generation !== undefined && this.generation !== activity.generation)) {
        this.seen = [];
        this.pendingCards = [];
        this.update({ cards: [], pending: 0 });
      }
      this.generation = activity.generation;
      this.deps.onActivity?.(activity);
      this.update({
        sync: 'live',
        bot: {
          slug: selection.botId,
          name: bot['name'],
          paused: bot['paused'],
          ...(typeof bot['avatar'] === 'string' ? { avatar: bot['avatar'] } : {}),
          ...(appearance === undefined ? {} : { appearance }),
        },
        activity: activity.bots.find((bot) => bot.slug === selection.botId),
      });
    };
    stream.addEventListener('companion/baseline', (event) => snapshot(event, true));
    stream.addEventListener('companion/activity', (event) => snapshot(event, false));
    stream.addEventListener('companion/message', (event) => {
      if (
        this.disposed ||
        this.stream !== stream ||
        this.generation === undefined ||
        !this.state.selection?.dm
      )
        return;
      const value = decode(event);
      if (
        value?.['generation'] !== this.generation ||
        value['botId'] !== selection.botId ||
        !['messageId', 'channelId', 'channelName', 'body'].every(
          (key) => typeof value[key] === 'string',
        ) ||
        typeof value['messageId'] !== 'string' ||
        typeof value['channelId'] !== 'string' ||
        typeof value['channelName'] !== 'string' ||
        typeof value['body'] !== 'string' ||
        this.seen.includes(value['messageId'])
      )
        return;
      this.seen.push(value['messageId']);
      if (this.seen.length > 80) this.seen.shift();
      const card: CompanionCard = {
        generation: this.generation,
        botId: selection.botId,
        messageId: value['messageId'],
        channelId: value['channelId'],
        channelName: value['channelName'],
        body: value['body'].slice(0, 2000),
        shown: 0,
        remaining: 0,
      };
      if (this.state.reading) {
        const capacity = 20 - this.state.cards.length;
        if (capacity > 0) {
          this.pendingCards.push(card);
          this.pendingCards = this.pendingCards.slice(-capacity);
        }
        this.update({ pending: this.pendingCards.length });
      } else this.update({ cards: [...this.state.cards, card].slice(-20) });
    });
    stream.addEventListener('error', () => {
      if (!this.disposed && this.stream === stream) this.update({ sync: 'stale' });
    });
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disconnect();
    this.listeners.clear();
  }
}
