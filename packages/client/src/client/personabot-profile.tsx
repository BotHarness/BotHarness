import { ChannelBridgeTable } from './channel-bridge-table.js';
import { MessagingProfile } from './messaging-profile.js';
import { useRef, useState, type FormEvent, type ReactElement } from 'react';

import {
  IconChevronLeftOutlineRegular,
  IconChevronRightOutlineRegular,
  IconEditOutlineRegular,
  IconPinFillRegular,
  IconPinOutlineRegular,
  Tag,
} from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from './actions.js';
import type { ProfileActivity } from './bridge.js';
import { PersonaBotAvatar } from './avatar.js';
import { AvatarAppearanceEditor } from './avatar-appearance-editor.js';
import { NameInput } from './name-input.js';
import type { BotHarnessTranslate } from './locale.js';
import { PersonaBotAvatarCropModal } from './personabot-avatar-crop.js';
import { StandingLimitsProfile } from './standing-limits-profile.js';
import { BotZipExportSection } from './bot-zip.js';
import type { ProfileCardRegistry } from './profile-cards.js';
import type { BotSummary, ChannelSummary } from './store.js';
import { useMountedResource } from './mounted-resource.js';

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
          appearance={bot.appearance}
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
  const [avatarFile, setAvatarFile] = useState<File | undefined>(undefined);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const nameInputMount = useMountedResource<HTMLInputElement>((input) => {
    input.focus();
    input.select();
  }, []);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const trimmed = draft.trim();
  const blank = trimmed.length === 0;
  const unchanged = trimmed === bot.displayName.trim();
  const visibleCards = cards.list().filter((card) => card.visible?.(bot) ?? true);

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

  const removeAvatar = async (): Promise<void> => {
    setAvatarBusy(true);
    const updated = await actions.setBotAvatar(channel.id, null);
    setAvatarBusy(false);
    if (!updated) setError(t('profile.avatar.failed'));
  };

  return (
    <div className="bh-profile-view">
      <button type="button" className="bh-profile-back" onClick={onClose}>
        <IconChevronLeftOutlineRegular />
        <span>{t('profile.close')}</span>
      </button>
      <div className="bh-profile-view-identity">
        <button
          type="button"
          className="bh-profile-avatar-button"
          aria-label={t('profile.avatar.change')}
          onClick={(event) => {
            const section = event.currentTarget
              .closest('.bh-profile-view')
              ?.querySelector<HTMLElement>('.bh-avatar-section');
            section?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            section?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({
              preventScroll: true,
            });
          }}
        >
          <PersonaBotAvatar
            t={t}
            personaBotId={bot.slug}
            name={bot.displayName}
            src={bot.avatar}
            appearance={bot.appearance}
            size={64}
            indicator={false}
          />
        </button>
        <div className="bh-profile-view-heading">
          {editing ? (
            <form className="bh-profile-name-edit" onSubmit={onSubmit}>
              <NameInput
                ref={nameInputMount}
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
          <input
            ref={avatarInputRef}
            className="bh-profile-avatar-input"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file !== undefined) setAvatarFile(file);
            }}
          />
          {error === undefined ? null : (
            <div className="bh-profile-error" role="alert">
              {error}
            </div>
          )}
        </div>
      </div>
      <AvatarAppearanceEditor
        key={`avatar-${bot.slug}`}
        bot={bot}
        channelId={channel.id}
        onSave={actions.setBotAppearance}
        onUpload={() => avatarInputRef.current?.click()}
        onRemoveImage={() => void removeAvatar()}
        imageBusy={avatarBusy}
        t={t}
      />
      {visibleCards.length === 0 ? null : (
        <section className="bh-profile-section" aria-label={t('profile.activitySection')}>
          <h2 className="bh-profile-section-title">{t('profile.activitySection')}</h2>
          <div className="bh-profile-cards">
            {visibleCards.map((card) => {
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
                  {card.render({
                    bot,
                    activity,
                    t,
                    compact: false,
                    loadUsage: (filter) => actions.profileUsage(channel.id, filter),
                  })}
                </section>
              );
            })}
          </div>
        </section>
      )}
      <StandingLimitsProfile key={`standing-${bot.slug}`} bot={bot} actions={actions} t={t} />
      <BotZipExportSection key={`zip-${bot.slug}`} bot={bot} actions={actions} t={t} />
      <MessagingProfile key={`im-${bot.slug}`} slug={bot.slug} actions={actions} t={t} />
      <ChannelBridgeTable
        channelId={channel.id}
        channelName={channel.name}
        botNames={new Map([[bot.slug, bot.displayName]])}
        actions={actions}
        t={t}
      />
      {avatarFile === undefined ? null : (
        <PersonaBotAvatarCropModal
          file={avatarFile}
          t={t}
          onClose={() => setAvatarFile(undefined)}
          onSave={async (avatar) => {
            const updated = await actions.setBotAvatar(channel.id, avatar);
            if (!updated) setError(t('profile.avatar.failed'));
            return updated;
          }}
        />
      )}
    </div>
  );
}
