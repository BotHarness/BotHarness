import { useEffect, useMemo, useState, type ReactElement } from 'react';

import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives';

import { PersonaBotAvatar, type PersonaBotActivityState } from './avatar.js';
import { HashIcon } from './hash-icon.js';
import type { BotHarnessTranslate } from './locale.js';
import { Modal } from './modal.js';
import type { BotSummary, ChannelSummary } from './store.js';

/** One hidden Channel projected with the optional PersonaBot presentation. */
export interface HiddenChannelItem {
  channel: ChannelSummary;
  bot?: BotSummary;
  activity?: PersonaBotActivityState;
}

export interface HiddenChannelsModalProps {
  items: readonly HiddenChannelItem[];
  t: BotHarnessTranslate;
  onRestore: (channelId: string) => void;
  onClose: () => void;
}

export const HIDDEN_CHANNEL_SEARCH_DEBOUNCE_MS = 180;

/** Searchable recovery surface for Channels omitted from roster navigation. */
export function HiddenChannelsModal({
  items,
  t,
  onRestore,
  onClose,
}: HiddenChannelsModalProps): ReactElement {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, HIDDEN_CHANNEL_SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [query]);
  const normalized = debouncedQuery.trim().toLowerCase();
  const visible = useMemo(
    () =>
      [...items].reverse().filter(({ channel, bot }) => {
        if (normalized.length === 0) return true;
        return [channel.name, bot?.displayName, ...(bot?.roles ?? [])].some((value) =>
          (value ?? '').toLowerCase().includes(normalized),
        );
      }),
    [items, normalized],
  );

  return (
    <Modal
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      title={t('hidden.modal.title')}
      description={t('hidden.modal.description')}
      contentClassName="bh-hidden-manager"
      footer={
        <Button variant="outline" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      <Input
        autoFocus
        className="bh-hidden-search"
        aria-label={t('hidden.search.placeholder')}
        placeholder={t('hidden.search.placeholder')}
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      <div className="bh-hidden-list" role="list">
        {visible.map(({ channel, bot, activity }) => (
          <div key={channel.id} className="bh-hidden-row" role="listitem">
            {bot === undefined ? (
              <span className="bh-hidden-channel-icon" aria-hidden="true">
                <HashIcon size={18} />
              </span>
            ) : (
              <PersonaBotAvatar
                t={t}
                personaBotId={bot.slug}
                name={bot.displayName}
                src={bot.avatar}
                state={activity}
                size={28}
              />
            )}
            <span className="bh-hidden-copy">
              <span className="bh-hidden-name">{bot?.displayName ?? channel.name}</span>
              <span className="bh-hidden-meta">
                {t(channel.type === 'dm' ? 'hidden.dm' : 'hidden.group')}
                {bot !== undefined && bot.roles.length > 0 ? ` · ${bot.roles.join(' · ')}` : ''}
              </span>
            </span>
            <Button variant="outline" size="sm" onClick={() => onRestore(channel.id)}>
              {t('hidden.restore')}
            </Button>
          </div>
        ))}
        {visible.length === 0 ? (
          <div className="bh-hidden-empty" role="status">
            {items.length === 0 ? t('hidden.empty') : t('hidden.noMatches')}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
