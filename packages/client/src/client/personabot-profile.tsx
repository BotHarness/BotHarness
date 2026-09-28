import { useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react';

import {
  IconChevronLeftOutlineRegular,
  IconChevronRightOutlineRegular,
  IconEditOutlineRegular,
  IconPinFillRegular,
  IconPinOutlineRegular,
  Tag,
} from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from './actions.js';
import type { BotSourcePolicyView, ProfileActivity } from './bridge.js';
import { PersonaBotAvatar } from './avatar.js';
import { NameInput } from './name-input.js';
import type { BotHarnessTranslate } from './locale.js';
import type { ProfileCardRegistry } from './profile-cards.js';
import type { BotSummary, ChannelSummary } from './store.js';

function RoleBadges({ roles }: { roles: readonly string[] }): ReactElement | null {
  if (roles.length === 0) return null;
  return (
    <span className="bh-profile-roles">
      {roles.map((role) => (
        <Tag key={role} tone="neutral">
          {role}
        </Tag>
      ))}
    </span>
  );
}

function Description({ text }: { text: string | undefined }): ReactElement | null {
  if (text === undefined || text.length === 0) return null;
  return <p className="bh-profile-description">{text}</p>;
}

export interface ProfilePopoverProps {
  bot: BotSummary;
  activity: ProfileActivity | undefined;
  cards: ProfileCardRegistry;
  pinned: readonly string[];
  t: BotHarnessTranslate;
  onExpand(): void;
}

/**
 * The avatar-anchored compact form of a PersonaBot Profile (ADR-0085): identity,
 * the pinned Profile Cards, and the entry into the Profile view.
 */
export function ProfilePopover({
  bot,
  activity,
  cards,
  pinned,
  t,
  onExpand,
}: ProfilePopoverProps): ReactElement {
  const pinnedCards = cards
    .list()
    .filter((card) => pinned.includes(card.id) && (card.visible?.(bot) ?? true));
  return (
    <div className="bh-profile-popover" role="dialog" aria-label={t('profile.label')}>
      <div className="bh-profile-popover-identity">
        <PersonaBotAvatar
          t={t}
          personaBotId={bot.slug}
          name={bot.displayName}
          src={bot.avatar}
          size={40}
          indicator={false}
        />
        <span className="bh-profile-popover-text">
          <span className="bh-profile-name">{bot.displayName}</span>
          <RoleBadges roles={bot.roles} />
        </span>
      </div>
      <Description text={bot.description} />
      {pinnedCards.length === 0 ? null : (
        <div className="bh-profile-popover-cards">
          {pinnedCards.map((card) => (
            <section key={card.id} className="bh-profile-card bh-profile-card-compact">
              <span className="bh-profile-card-label">{card.label}</span>
              {card.render({ bot, activity, t, compact: true })}
            </section>
          ))}
        </div>
      )}
      <button type="button" className="bh-profile-expand" onClick={onExpand}>
        <span>{t('profile.open')}</span>
        <IconChevronRightOutlineRegular />
      </button>
    </div>
  );
}

export interface ProfileViewProps {
  bot: BotSummary;
  channel: ChannelSummary;
  activity: ProfileActivity | undefined;
  cards: ProfileCardRegistry;
  pinned: readonly string[];
  actions: BridgeActions;
  t: BotHarnessTranslate;
  onTogglePin(id: string): void;
  onClose(): void;
}

/**
 * The expanded form of a PersonaBot Profile (ADR-0085): it occupies the
 * Channel body, replacing the Chat and the composer until the Human exits.
 */
export function ProfileView({
  bot,
  channel,
  activity,
  cards,
  pinned,
  actions,
  t,
  onTogglePin,
  onClose,
}: ProfileViewProps): ReactElement {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(bot.displayName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [sourcePolicies, setSourcePolicies] = useState<BotSourcePolicyView[]>();
  const [sourcePolicyError, setSourcePolicyError] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const trimmed = draft.trim();
  const blank = trimmed.length === 0;
  const unchanged = trimmed === bot.displayName.trim();

  useEffect(() => {
    let active = true;
    setSourcePolicies(undefined);
    setSourcePolicyError(false);
    void actions.botSourcePolicies(bot.slug).then(
      (policies) => {
        if (active) setSourcePolicies(policies);
      },
      () => {
        if (active) setSourcePolicyError(true);
      },
    );
    return () => {
      active = false;
    };
  }, [actions, bot.slug]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const startEditing = (): void => {
    setDraft(bot.displayName);
    setError(undefined);
    setEditing(true);
  };

  const cancelEditing = (): void => {
    setEditing(false);
    setError(undefined);
  };

  const save = async (): Promise<void> => {
    if (blank || busy) return;
    if (unchanged) {
      cancelEditing();
      return;
    }
    setBusy(true);
    const renamed = await actions.renameChannel(channel.id, trimmed);
    setBusy(false);
    if (renamed) {
      setEditing(false);
      setError(undefined);
    } else {
      setError(t('profile.renameFailed'));
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void save();
  };

  return (
    <div className="bh-profile-view">
      <button type="button" className="bh-profile-back" onClick={onClose}>
        <IconChevronLeftOutlineRegular />
        <span>{t('profile.close')}</span>
      </button>
      <div className="bh-profile-view-identity">
        <PersonaBotAvatar
          t={t}
          personaBotId={bot.slug}
          name={bot.displayName}
          src={bot.avatar}
          size={64}
          indicator={false}
        />
        <div className="bh-profile-view-heading">
          {editing ? (
            <form className="bh-profile-name-edit" onSubmit={onSubmit}>
              <NameInput
                ref={inputRef}
                value={draft}
                aria-label={t('bot.name.label')}
                disabled={busy}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Escape') return;
                  event.preventDefault();
                  event.stopPropagation();
                  cancelEditing();
                }}
              />
              <div className="bh-profile-name-actions">
                <button
                  type="button"
                  className="bh-profile-action"
                  disabled={busy}
                  onClick={cancelEditing}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="bh-profile-action bh-profile-action-primary"
                  disabled={blank || busy}
                >
                  {t('profile.save')}
                </button>
              </div>
            </form>
          ) : (
            <div className="bh-profile-view-name-row">
              <h2 className="bh-profile-view-name">{bot.displayName}</h2>
              <button
                type="button"
                className="bh-profile-edit"
                aria-label={t('profile.name.edit')}
                onClick={startEditing}
              >
                <IconEditOutlineRegular />
              </button>
            </div>
          )}
          <RoleBadges roles={bot.roles} />
          <Description text={bot.description} />
          {error === undefined ? null : (
            <div className="bh-profile-error" role="alert">
              {error}
            </div>
          )}
        </div>
      </div>
      <div className="bh-profile-cards">
        <section className="bh-profile-card" aria-label={t('sourcePolicy.title')}>
          <header className="bh-profile-card-head">
            <span className="bh-profile-card-label">{t('sourcePolicy.title')}</span>
            <Tag tone="neutral">{t('sourcePolicy.readOnly')}</Tag>
          </header>
          {sourcePolicyError ? (
            <div className="bh-error" role="alert">
              {t('sourcePolicy.error')}
            </div>
          ) : sourcePolicies === undefined ? (
            <div className="bh-note">{t('sourcePolicy.loading')}</div>
          ) : (
            sourcePolicies.map((policy) => (
              <div key={policy.sourceClass} className="bh-source-policy-row">
                <strong>{t('sourcePolicy.humanDm')}</strong>
                <span>{t('sourcePolicy.admitImmediate')}</span>
                <span className="bh-note">
                  {t('sourcePolicy.revision', { revision: policy.revision })}
                  {' · '}
                  {t('sourcePolicy.builtIn')}
                  {' · '}
                  {new Date(policy.changedAt).toLocaleString()}
                </span>
              </div>
            ))
          )}
        </section>
      </div>
      {cards.list().filter((card) => card.visible?.(bot) ?? true).length === 0 ? null : (
        <div className="bh-profile-cards">
          {cards
            .list()
            .filter((card) => card.visible?.(bot) ?? true)
            .map((card) => {
              const isPinned = pinned.includes(card.id);
              return (
                <section key={card.id} className="bh-profile-card">
                  <header className="bh-profile-card-head">
                    <span className="bh-profile-card-label">{card.label}</span>
                    <button
                      type="button"
                      className="bh-profile-pin"
                      aria-pressed={isPinned}
                      aria-label={isPinned ? t('profile.unpin') : t('profile.pin')}
                      onClick={() => onTogglePin(card.id)}
                    >
                      {isPinned ? <IconPinFillRegular /> : <IconPinOutlineRegular />}
                    </button>
                  </header>
                  {card.render({ bot, activity, t, compact: false })}
                </section>
              );
            })}
        </div>
      )}
    </div>
  );
}
