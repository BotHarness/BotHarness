import type { CompanionBot, CompanionMessage } from '../../../core/src/companions/feed.js';
import {
  companionSourceEnabled,
  companionMessageIdentity,
} from '../../../core/src/companions/sources.js';
import {
  messagePreview,
  messageGraphemeBoundaries,
} from '../../../core/src/channels/message-preview.js';
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
  visibility: 'own-dm' | 'shared' | 'all-bot';
  walking: boolean;
  position: number;
}
export interface CompanionCard extends CompanionMessage {
  boundaries: readonly number[];
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
  capacity: { layers: number; retention: number };
}
export interface CompanionStream {
  readonly readyState?: number;
  addEventListener(name: string, listener: (event: Event) => void): void;
  close(): void;
}
interface CompanionDependencies {
  initialSelection?: CompanionSelection;
  onSelection?(selection: CompanionSelection | undefined): void;
  onActivity?(snapshot: PersonaBotActivitySnapshot): void;
  storage?: ConfigStorage | undefined;
  context(): Promise<{ profileId: string }>;
  exists?(botId: string): Promise<boolean>;
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
    capacity: { layers: 3, retention: 20 },
  };
  private listeners = new Set<() => void>();
  private stream: CompanionStream | undefined;
  private profileId: string | undefined;
  private generation: string | undefined;
  private preservedGeneration: string | undefined;
  private pendingCards: CompanionCard[] = [];
  private seen: string[] = [];
  private identityRevision = 0;
  private disposed = false;
  constructor(private readonly deps: CompanionDependencies) {
    if (deps.initialSelection) this.state = { ...this.state, selection: deps.initialSelection };
  }
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
      let selection: CompanionSelection | undefined = this.deps.initialSelection;
      try {
        const raw = this.deps.storage?.getItem(this.key);
        const value = raw ? object(JSON.parse(raw)) : undefined;
        if (!selection && typeof value?.['botId'] === 'string' && value['botId'].length > 0)
          selection = {
            botId: value['botId'],
            activity: value['activity'] !== false,
            dm: value['dm'] !== false,
            group: value['group'] === true,
            visibility:
              value['visibility'] === 'own-dm' || value['visibility'] === 'all-bot'
                ? value['visibility']
                : 'shared',
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
  configure(change: Partial<Omit<CompanionSelection, 'botId'>>): void {
    const selected = this.state.selection;
    if (!selected) return;
    this.update({ selection: { ...selected, ...change } });
    this.save();
    if (
      (change.dm !== undefined && change.dm !== selected.dm) ||
      (change.group !== undefined && change.group !== selected.group) ||
      (change.visibility !== undefined && change.visibility !== selected.visibility)
    )
      this.connect(true);
  }
  setCapacity(capacity: { layers: number; retention: number }): void {
    this.pendingCards = this.pendingCards.slice(-capacity.retention);
    this.seen = this.seen.slice(-capacity.retention * 4);
    this.update({
      capacity,
      cards: this.state.cards.slice(-capacity.retention),
      pending: this.pendingCards.length,
    });
  }
  reading(reading: boolean): void {
    if (reading === this.state.reading) return;
    if (reading) this.update({ reading });
    else {
      const cards = [...this.state.cards, ...this.pendingCards].slice(
        -this.state.capacity.retention,
      );
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
          : card.boundaries[
              Math.min(
                card.boundaries.length - 1,
                card.boundaries.indexOf(card.shown) + Math.max(1, Math.floor(elapsed / 35)),
              )
            ]!;
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
      return remaining > 0 ? [remaining === card.remaining ? card : { ...card, remaining }] : [];
    });
    if (
      cards.length === this.state.cards.length &&
      cards.every((card, index) => card === this.state.cards[index])
    )
      return;
    this.update({ cards });
  }
  dismiss(messageId: string, channelId?: string): void {
    this.update({
      cards: this.state.cards.filter(
        (card) =>
          card.messageId !== messageId || (channelId !== undefined && card.channelId !== channelId),
      ),
    });
  }
  private save(): void {
    this.deps.onSelection?.(this.state.selection);
    try {
      this.deps.storage?.setItem(this.key, JSON.stringify(this.state.selection ?? null));
    } catch {}
  }
  private disconnect(): void {
    this.identityRevision++;
    this.stream?.close();
    this.stream = undefined;
    this.generation = undefined;
    this.preservedGeneration = undefined;
    this.seen = [];
    this.pendingCards = [];
  }
  private connect(preserve = false): void {
    const previousGeneration = this.generation ?? this.preservedGeneration;
    const selection = this.state.selection;
    const cards =
      preserve && selection
        ? this.state.cards.filter((card) =>
            companionSourceEnabled(card.source ?? 'own-dm', selection),
          )
        : [];
    const pending =
      preserve && selection
        ? this.pendingCards.filter((card) =>
            companionSourceEnabled(card.source ?? 'own-dm', selection),
          )
        : [];
    const seen = preserve ? this.seen : [];
    this.disconnect();
    this.preservedGeneration = preserve ? previousGeneration : undefined;
    this.pendingCards = pending;
    this.seen = seen;
    this.update({ cards, pending: pending.length, sync: 'connecting' });
    if (!selection || this.disposed) return;
    let stream: CompanionStream;
    try {
      stream = this.deps.source(
        `/api/botharness/companion?botId=${encodeURIComponent(selection.botId)}&dm=${selection.dm ? 1 : 0}&group=${selection.group ? 1 : 0}&visibility=${selection.visibility}`,
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
      this.identityRevision++;
      const appearance =
        isAvatarAppearance(bot['appearance']) || isRetainedAvatarAppearance(bot['appearance'])
          ? bot['appearance']
          : undefined;
      if (
        (this.state.bot && this.state.bot.paused !== bot['paused']) ||
        (typeof bot['lifecycle'] === 'string' &&
          this.state.bot?.lifecycle !== undefined &&
          this.state.bot.lifecycle !== bot['lifecycle'])
      ) {
        this.seen = [];
        this.pendingCards = [];
        this.update({ cards: [], pending: 0, reading: false });
      }
      if (
        (baseline &&
          this.preservedGeneration !== activity.generation &&
          !(value?.['recovered'] === true && this.generation === activity.generation)) ||
        (this.generation !== undefined && this.generation !== activity.generation)
      ) {
        this.seen = [];
        this.pendingCards = [];
        this.update({ cards: [], pending: 0 });
      }
      this.preservedGeneration = undefined;
      this.generation = activity.generation;
      this.deps.onActivity?.(activity);
      this.update({
        sync: 'live',
        bot: {
          slug: selection.botId,
          name: bot['name'],
          paused: bot['paused'],
          ...(typeof bot['lifecycle'] === 'string' ? { lifecycle: bot['lifecycle'] } : {}),
          ...(typeof bot['avatar'] === 'string' ? { avatar: bot['avatar'] } : {}),
          ...(appearance === undefined ? {} : { appearance }),
        },
        activity: activity.bots.find((bot) => bot.slug === selection.botId),
      });
    };
    stream.addEventListener('companion/baseline', (event) => snapshot(event, true));
    stream.addEventListener('companion/activity', (event) => snapshot(event, false));
    stream.addEventListener('companion/message', (event) => {
      if (this.disposed || this.stream !== stream || this.generation === undefined) return;
      const value = decode(event);
      const current = this.state.selection;
      const source = value?.['source'] ?? 'own-dm';
      if (!current || this.state.bot?.paused === true || !companionSourceEnabled(source, current))
        return;
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
        this.seen.includes(companionMessageIdentity(value['channelId'], value['messageId']))
      )
        return;
      this.seen.push(companionMessageIdentity(value['channelId'], value['messageId']));
      if (this.seen.length > this.state.capacity.retention * 4) this.seen.shift();
      const body = messagePreview(value['body']);
      const card: CompanionCard = {
        generation: this.generation,
        botId: selection.botId,
        messageId: value['messageId'],
        channelId: value['channelId'],
        channelName: value['channelName'],
        body,
        source,
        canOpen: value['canOpen'] === undefined ? source === 'own-dm' : value['canOpen'] === true,
        participants: Array.isArray(value['participants'])
          ? value['participants'].filter((name): name is string => typeof name === 'string')
          : [],
        boundaries: messageGraphemeBoundaries(body),
        shown: 0,
        remaining: 0,
      };
      if (this.state.reading) {
        this.pendingCards.push(card);
        this.pendingCards = this.pendingCards.slice(-this.state.capacity.retention);
        this.update({ pending: this.pendingCards.length });
      } else
        this.update({ cards: [...this.state.cards, card].slice(-this.state.capacity.retention) });
    });
    stream.addEventListener('error', () => {
      if (this.disposed || this.stream !== stream) return;
      const identityRevision = ++this.identityRevision;
      this.update({ sync: 'stale' });
      if (stream.readyState === 2)
        void this.deps
          .exists?.(selection.botId)
          .then((exists) => {
            if (
              !exists &&
              !this.disposed &&
              this.stream === stream &&
              this.identityRevision === identityRevision
            )
              this.remove();
          })
          .catch(() => undefined);
    });
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disconnect();
    this.state = {
      ...this.state,
      selection: undefined,
      bot: undefined,
      activity: undefined,
      cards: [],
      pending: 0,
      reading: false,
    };
    this.listeners.clear();
  }
}
