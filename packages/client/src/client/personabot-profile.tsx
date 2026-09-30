import { MessagingProfile } from './messaging-profile.js';
import { useRef, useState, type FormEvent, type ReactElement } from 'react';

import {
  IconChevronLeftOutlineRegular,
  IconChevronRightOutlineRegular,
  IconEditOutlineRegular,
  IconPinFillRegular,
  IconPinOutlineRegular,
  Button,
  Tag,
} from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from './actions.js';
import type { BotSourcePolicyEdit, BotSourcePolicyView, ProfileActivity } from './bridge.js';
import { PersonaBotAvatar } from './avatar.js';
import { NameInput } from './name-input.js';
import { Modal } from './modal.js';
import type { BotHarnessTranslate } from './locale.js';
import { PersonaBotAvatarCropModal } from './personabot-avatar-crop.js';
import { ModelPresetProfile } from './model-preset-profile.js';
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
  const [sourcePolicies, setSourcePolicies] = useState<BotSourcePolicyView[]>();
  const [sourcePolicyError, setSourcePolicyError] = useState(false);
  const [editingSourcePolicy, setEditingSourcePolicy] =
    useState<BotSourcePolicyEdit['sourceClass']>();
  const [sourceWakeDraft, setSourceWakeDraft] =
    useState<BotSourcePolicyView['wake']>('conditional');
  const [sourceDeliveryDraft, setSourceDeliveryDraft] = useState<'steer' | 'turn'>('steer');
  const [digestCountDraft, setDigestCountDraft] = useState(5);
  const [digestIntervalDraft, setDigestIntervalDraft] = useState(30);
  const [sourcePolicyBusy, setSourcePolicyBusy] = useState(false);
  const [sourcePolicySaveError, setSourcePolicySaveError] = useState(false);
  const nameInputMount = useMountedResource<HTMLInputElement>((input) => {
    input.focus();
    input.select();
  }, []);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const activeBotSlug = useRef<string | undefined>(undefined);
  const sourcePolicyGeneration = useRef(0);
  const trimmed = draft.trim();
  const blank = trimmed.length === 0;
  const unchanged = trimmed === bot.displayName.trim();
  const visibleCards = cards.list().filter((card) => card.visible?.(bot) ?? true);

  const sourcePolicyMount = useMountedResource<HTMLDivElement>(() => {
    ++sourcePolicyGeneration.current;
    activeBotSlug.current = bot.slug;
    let active = true;
    setSourcePolicyBusy(false);
    setSourcePolicySaveError(false);
    setEditingSourcePolicy(undefined);
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
      ++sourcePolicyGeneration.current;
      activeBotSlug.current = undefined;
    };
  }, [actions, bot.slug]);

  const changeSourcePolicy = async (reset: boolean): Promise<void> => {
    if (sourcePolicyBusy || editingSourcePolicy === undefined) return;
    if (
      !reset &&
      editingSourcePolicy === 'group-ordinary' &&
      (!Number.isSafeInteger(digestCountDraft) ||
        digestCountDraft < 1 ||
        digestCountDraft > 100 ||
        !Number.isSafeInteger(digestIntervalDraft) ||
        digestIntervalDraft < 1 ||
        digestIntervalDraft > 3600)
    ) {
      setSourcePolicySaveError(true);
      return;
    }
    setSourcePolicyBusy(true);
    setSourcePolicySaveError(false);
    const generation = sourcePolicyGeneration.current;
    const current = (): boolean =>
      activeBotSlug.current === bot.slug && sourcePolicyGeneration.current === generation;
    try {
      if (reset) await actions.resetBotSourcePolicy(bot.slug, editingSourcePolicy);
      else if (editingSourcePolicy === 'assignment-report') {
        if (sourceWakeDraft !== 'conditional' && sourceWakeDraft !== 'immediate')
          throw new Error('Invalid Assignment report wake');
        await actions.setBotSourcePolicy(bot.slug, {
          sourceClass: 'assignment-report',
          wake: sourceWakeDraft,
        });
      } else if (
        editingSourcePolicy === 'human-dm' ||
        editingSourcePolicy === 'bot-dm' ||
        editingSourcePolicy === 'group-mention'
      ) {
        await actions.setBotSourcePolicy(bot.slug, {
          sourceClass: editingSourcePolicy,
          wake: 'immediate',
          delivery: sourceDeliveryDraft,
        });
      } else {
        if (
          sourceWakeDraft !== 'immediate' &&
          sourceWakeDraft !== 'digest' &&
          sourceWakeDraft !== 'mentions' &&
          sourceWakeDraft !== 'silent'
        )
          throw new Error('Invalid ordinary Group wake');
        await actions.setBotSourcePolicy(bot.slug, {
          sourceClass: 'group-ordinary',
          wake: sourceWakeDraft,
          digestCount: digestCountDraft,
          digestIntervalSeconds: digestIntervalDraft,
        });
      }
      if (!current()) return;
      const policies = await actions.botSourcePolicies(bot.slug);
      if (!current()) return;
      setSourcePolicies(policies);
      setEditingSourcePolicy(undefined);
    } catch {
      if (current()) setSourcePolicySaveError(true);
    } finally {
      if (current()) setSourcePolicyBusy(false);
    }
  };

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
    <div className="bh-profile-view" ref={sourcePolicyMount}>
      <button type="button" className="bh-profile-back" onClick={onClose}>
        <IconChevronLeftOutlineRegular />
        <span>{t('profile.close')}</span>
      </button>
      <div className="bh-profile-view-identity">
        <button
          type="button"
          className="bh-profile-avatar-button"
          aria-label={t('profile.avatar.change')}
          disabled={avatarBusy}
          onClick={() => avatarInputRef.current?.click()}
        >
          <PersonaBotAvatar
            t={t}
            personaBotId={bot.slug}
            name={bot.displayName}
            src={bot.avatar}
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
          <div className="bh-profile-avatar-actions">
            <button
              type="button"
              className="bh-profile-action"
              disabled={avatarBusy}
              onClick={() => avatarInputRef.current?.click()}
            >
              {t('profile.avatar.change')}
            </button>
            {bot.avatar === undefined ? null : (
              <button
                type="button"
                className="bh-profile-action"
                disabled={avatarBusy}
                onClick={() => void removeAvatar()}
              >
                {t('profile.avatar.remove')}
              </button>
            )}
          </div>
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
                  {card.render({ bot, activity, t, compact: false })}
                </section>
              );
            })}
          </div>
        </section>
      )}
      <ModelPresetProfile key={bot.slug} slug={bot.slug} actions={actions} t={t} />
      <MessagingProfile key={`im-${bot.slug}`} slug={bot.slug} actions={actions} t={t} />
      <section
        className="bh-profile-section bh-profile-policy-section"
        aria-label={t('sourcePolicy.title')}
      >
        <details className="bh-profile-policy-details">
          <summary className="bh-profile-policy-summary">
            <span className="bh-profile-policy-summary-text">
              <strong>{t('sourcePolicy.title')}</strong>
              <span>{t('sourcePolicy.summary')}</span>
            </span>
            <IconChevronRightOutlineRegular />
          </summary>
          <div className="bh-profile-cards">
            <section className="bh-profile-card" aria-label={t('sourcePolicy.defaults')}>
              <header className="bh-profile-card-head">
                <span className="bh-profile-card-label">{t('sourcePolicy.defaults')}</span>
                <Tag tone="neutral">{t('sourcePolicy.editableRules')}</Tag>
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
                    <strong>
                      {
                        {
                          'human-dm': t('sourcePolicy.humanDm'),
                          'bot-dm': t('sourcePolicy.botDm'),
                          'group-mention': t('sourcePolicy.groupMention'),
                          'group-ordinary': t('sourcePolicy.groupOrdinary'),
                          'group-invite': t('sourcePolicy.groupInvite'),
                          'group-join-request': t('sourcePolicy.groupJoinRequest'),
                          'group-join-decision': t('sourcePolicy.groupJoinDecision'),
                          'assignment-report': t('sourcePolicy.assignmentReport'),
                          'assignment-lifecycle': t('sourcePolicy.assignmentLifecycle'),
                        }[policy.sourceClass]
                      }
                    </strong>
                    <span>
                      {policy.wake === 'digest'
                        ? t('sourcePolicy.admitDigest', {
                            count: policy.digestCount ?? 0,
                            seconds: policy.digestIntervalSeconds ?? 0,
                          })
                        : policy.wake === 'conditional'
                          ? t('sourcePolicy.admitConditional')
                          : policy.wake === 'mentions'
                            ? t('sourcePolicy.admitMentions')
                            : policy.wake === 'silent'
                              ? t('sourcePolicy.admitSilent')
                              : t('sourcePolicy.admitImmediate')}
                    </span>
                    {(policy.sourceClass === 'human-dm' ||
                      policy.sourceClass === 'bot-dm' ||
                      policy.sourceClass === 'group-mention') && (
                      <span>
                        {'· '}
                        {t(
                          policy.delivery === 'turn'
                            ? 'sourcePolicy.deliveryTurn'
                            : 'sourcePolicy.deliverySteer',
                        )}
                      </span>
                    )}
                    {policy.sourceClass === 'group-ordinary' && (
                      <span className="bh-note">{t('sourcePolicy.groupOverride')}</span>
                    )}
                    <span className="bh-note">
                      {t('sourcePolicy.recentWakes', { count: policy.recentWakeCount })}
                    </span>
                    <span className="bh-note">
                      {t('sourcePolicy.revision', { revision: policy.revision })}
                      {' · '}
                      {!policy.overrideActive &&
                        policy.lastActor.kind !== 'built-in' &&
                        `${t('sourcePolicy.restoredDefault')} · `}
                      {policy.lastActor.kind === 'built-in'
                        ? t('sourcePolicy.builtIn')
                        : policy.lastActor.kind === 'human'
                          ? t('sourcePolicy.human')
                          : policy.lastActor.kind === 'bot'
                            ? t('sourcePolicy.botActor', { slug: policy.lastActor.botSlug })
                            : t('sourcePolicy.builtIn')}
                      {' · '}
                      {new Date(policy.changedAt).toLocaleString()}
                    </span>
                    {(policy.sourceClass === 'assignment-report' ||
                      policy.sourceClass === 'group-ordinary' ||
                      policy.sourceClass === 'human-dm' ||
                      policy.sourceClass === 'bot-dm' ||
                      policy.sourceClass === 'group-mention') && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSourceWakeDraft(policy.wake);
                          setSourceDeliveryDraft(policy.delivery);
                          setDigestCountDraft(policy.digestCount ?? 5);
                          setDigestIntervalDraft(policy.digestIntervalSeconds ?? 30);
                          setSourcePolicySaveError(false);
                          setEditingSourcePolicy(
                            policy.sourceClass as BotSourcePolicyEdit['sourceClass'],
                          );
                        }}
                      >
                        {t('sourcePolicy.edit')}
                      </Button>
                    )}
                  </div>
                ))
              )}
            </section>
          </div>
        </details>
      </section>
      {editingSourcePolicy !== undefined && (
        <Modal
          open
          onClose={() => setEditingSourcePolicy(undefined)}
          closeLabel={t('common.close')}
          title={t(
            editingSourcePolicy === 'group-ordinary'
              ? 'sourcePolicy.groupEditTitle'
              : editingSourcePolicy === 'assignment-report'
                ? 'sourcePolicy.editTitle'
                : 'sourcePolicy.immediateEditTitle',
          )}
          description={t(
            editingSourcePolicy === 'group-ordinary'
              ? 'sourcePolicy.groupEditDescription'
              : editingSourcePolicy === 'assignment-report'
                ? 'sourcePolicy.editDescription'
                : 'sourcePolicy.immediateEditDescription',
          )}
          footer={
            <>
              <Button
                variant="outline"
                disabled={sourcePolicyBusy}
                onClick={() => void changeSourcePolicy(true)}
              >
                {t('sourcePolicy.reset')}
              </Button>
              <Button
                variant="primary"
                disabled={sourcePolicyBusy}
                onClick={() => void changeSourcePolicy(false)}
              >
                {t('profile.save')}
              </Button>
            </>
          }
        >
          {editingSourcePolicy === 'human-dm' ||
          editingSourcePolicy === 'bot-dm' ||
          editingSourcePolicy === 'group-mention' ? (
            <select
              className="bh-profile-policy-select"
              aria-label={t('sourcePolicy.immediateEditTitle')}
              value={sourceDeliveryDraft}
              disabled={sourcePolicyBusy}
              onChange={(event) =>
                setSourceDeliveryDraft(event.target.value === 'turn' ? 'turn' : 'steer')
              }
            >
              <option value="steer">{t('sourcePolicy.deliverySteerOption')}</option>
              <option value="turn">{t('sourcePolicy.deliveryTurnOption')}</option>
            </select>
          ) : (
            <select
              className="bh-profile-policy-select"
              aria-label={t(
                editingSourcePolicy === 'group-ordinary'
                  ? 'sourcePolicy.groupEditTitle'
                  : 'sourcePolicy.editTitle',
              )}
              value={sourceWakeDraft}
              disabled={sourcePolicyBusy}
              onChange={(event) =>
                setSourceWakeDraft(event.target.value as BotSourcePolicyView['wake'])
              }
            >
              {editingSourcePolicy === 'assignment-report' ? (
                <>
                  <option value="conditional">{t('sourcePolicy.conditionalOption')}</option>
                  <option value="immediate">{t('sourcePolicy.immediateOption')}</option>
                </>
              ) : (
                <>
                  <option value="immediate">{t('sourcePolicy.groupAllOption')}</option>
                  <option value="digest">{t('sourcePolicy.groupDigestOption')}</option>
                  <option value="mentions">{t('sourcePolicy.groupMentionsOption')}</option>
                  <option value="silent">{t('sourcePolicy.groupSilentOption')}</option>
                </>
              )}
            </select>
          )}
          {editingSourcePolicy === 'group-ordinary' && sourceWakeDraft === 'digest' && (
            <div className="bh-profile-policy-digest">
              <label>
                {t('sourcePolicy.digestCount')}
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={digestCountDraft}
                  disabled={sourcePolicyBusy}
                  onChange={(event) => setDigestCountDraft(Number(event.target.value))}
                />
              </label>
              <label>
                {t('sourcePolicy.digestInterval')}
                <input
                  type="number"
                  min={1}
                  max={3600}
                  value={digestIntervalDraft}
                  disabled={sourcePolicyBusy}
                  onChange={(event) => setDigestIntervalDraft(Number(event.target.value))}
                />
              </label>
            </div>
          )}
          {sourcePolicySaveError && (
            <div className="bh-modal-error" role="alert">
              {t('sourcePolicy.saveFailed')}
            </div>
          )}
        </Modal>
      )}
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
