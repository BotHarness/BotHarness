import type { ReactElement } from 'react';
import type { ProfileActivityWindow, UsageFilter, UsageQueryResult } from './bridge.js';

import type { GroupProfileActivity, ProfileActivity } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import type { BotSummary, ChannelSummary } from './store.js';

export interface ProfileCardProps {
  bot: BotSummary;
  activity: ProfileActivity | undefined;
  t: BotHarnessTranslate;
}

export interface ProfileCardViewProps extends ProfileCardProps {
  compact: boolean;
  loadUsage?: (filter: UsageFilter) => Promise<UsageQueryResult>;
  loadActivity?: (window: ProfileActivityWindow) => Promise<ProfileActivity>;
}

export interface ProfileCardDescriptor {
  id: string;
  label: string;
  order?: number;
  visible?(bot: BotSummary): boolean;
  render(props: ProfileCardViewProps): ReactElement;
}

export interface GroupProfileCardViewProps {
  channel: ChannelSummary;
  activity: GroupProfileActivity | undefined;
  t: BotHarnessTranslate;
  compact: boolean;
  botNames: ReadonlyMap<string, string>;
}

export interface GroupProfileCardDescriptor {
  id: string;
  label: string;
  order?: number;
  render(props: GroupProfileCardViewProps): ReactElement;
}

export interface ProfileCardRegistry {
  list(): readonly ProfileCardDescriptor[];
  listGroup(): readonly GroupProfileCardDescriptor[];
  subscribe(listener: () => void): () => void;
  register(card: ProfileCardDescriptor): () => void;
  registerGroup(card: GroupProfileCardDescriptor): () => void;
  dispose(): void;
}

const PROFILE_CARDS_STORAGE_KEY = 'botharness.profile-cards';
const GROUP_PROFILE_CARDS_STORAGE_KEY = 'botharness.group-profile-cards';

export const DEFAULT_PINNED_PROFILE_CARDS: readonly string[] = ['token-usage', 'event-activity'];
const RETIRED_PROFILE_CARDS: readonly string[] = ['totals'];
export const DEFAULT_PINNED_GROUP_PROFILE_CARDS: readonly string[] = ['group-messages'];

export function createProfileCardRegistry(): ProfileCardRegistry {
  let cards: readonly ProfileCardDescriptor[] = [];
  let groupCards: readonly GroupProfileCardDescriptor[] = [];
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  const orderOf = (card: { order?: number }): number => card.order ?? 0;
  return {
    list: () => cards,
    listGroup: () => groupCards,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    register(card) {
      if (card.id.length === 0) throw new Error('Profile Card id is required');
      if (cards.some((existing) => existing.id === card.id)) {
        throw new Error(`duplicate Profile Card: ${card.id}`);
      }
      cards = [...cards, card].sort(
        (left, right) => orderOf(left) - orderOf(right) || left.id.localeCompare(right.id),
      );
      notify();
      return () => {
        cards = cards.filter((existing) => existing !== card);
        notify();
      };
    },
    registerGroup(card) {
      if (card.id.length === 0) throw new Error('Group Profile Card id is required');
      if (groupCards.some((existing) => existing.id === card.id)) {
        throw new Error(`duplicate Group Profile Card: ${card.id}`);
      }
      groupCards = [...groupCards, card].sort(
        (left, right) => orderOf(left) - orderOf(right) || left.id.localeCompare(right.id),
      );
      notify();
      return () => {
        groupCards = groupCards.filter((existing) => existing !== card);
        notify();
      };
    },
    dispose() {
      cards = [];
      groupCards = [];
      notify();
    },
  };
}

export const EMPTY_PROFILE_CARDS: ProfileCardRegistry = createProfileCardRegistry();

function profileCardStorage(): Storage | undefined {
  return typeof window === 'undefined' ? undefined : window.localStorage;
}

export function loadPinnedProfileCards(): string[] {
  const raw = profileCardStorage()?.getItem(PROFILE_CARDS_STORAGE_KEY);
  if (raw === null || raw === undefined) return [...DEFAULT_PINNED_PROFILE_CARDS];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== 'string')) {
      return [...DEFAULT_PINNED_PROFILE_CARDS];
    }
    return (parsed as string[]).filter((id) => !RETIRED_PROFILE_CARDS.includes(id));
  } catch {
    return [...DEFAULT_PINNED_PROFILE_CARDS];
  }
}

export function savePinnedProfileCards(ids: readonly string[]): void {
  profileCardStorage()?.setItem(PROFILE_CARDS_STORAGE_KEY, JSON.stringify([...ids]));
}

export function togglePinnedProfileCard(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id];
}

export function loadPinnedGroupProfileCards(): string[] {
  const raw = profileCardStorage()?.getItem(GROUP_PROFILE_CARDS_STORAGE_KEY);
  if (raw === null || raw === undefined) return [...DEFAULT_PINNED_GROUP_PROFILE_CARDS];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((value) => typeof value === 'string')
      ? (parsed as string[])
      : [...DEFAULT_PINNED_GROUP_PROFILE_CARDS];
  } catch {
    return [...DEFAULT_PINNED_GROUP_PROFILE_CARDS];
  }
}

export function savePinnedGroupProfileCards(ids: readonly string[]): void {
  profileCardStorage()?.setItem(GROUP_PROFILE_CARDS_STORAGE_KEY, JSON.stringify([...ids]));
}
