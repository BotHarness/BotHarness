import type { ReactElement } from 'react';

import type { ProfileActivity } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import type { BotSummary } from './store.js';

export interface ProfileCardProps {
  bot: BotSummary;
  activity: ProfileActivity | undefined;
  t: BotHarnessTranslate;
}

export interface ProfileCardViewProps extends ProfileCardProps {
  compact: boolean;
}

export interface ProfileCardDescriptor {
  id: string;
  label: string;
  order?: number;
  visible?(bot: BotSummary): boolean;
  render(props: ProfileCardViewProps): ReactElement;
}

export interface ProfileCardRegistry {
  list(): readonly ProfileCardDescriptor[];
  subscribe(listener: () => void): () => void;
  register(card: ProfileCardDescriptor): () => void;
  dispose(): void;
}

const PROFILE_CARDS_STORAGE_KEY = 'botharness.profile-cards';

export const DEFAULT_PINNED_PROFILE_CARDS: readonly string[] = ['token-usage', 'event-activity'];

export function createProfileCardRegistry(): ProfileCardRegistry {
  let cards: readonly ProfileCardDescriptor[] = [];
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  const orderOf = (card: ProfileCardDescriptor): number => card.order ?? 0;
  return {
    list: () => cards,
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
    dispose() {
      cards = [];
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
    return parsed as string[];
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
