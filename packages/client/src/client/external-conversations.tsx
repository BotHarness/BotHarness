import { useState, type ReactElement, type ReactNode } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MessagingConversationInput } from '../../../core/src/messaging/conversations.js';
import type { GroupReceptionInput } from '../../../core/src/messaging/group-policy.js';
import type { MessagingIdentityView } from '../../../core/src/messaging/identity.js';
import type { MessagingSnapshot } from '../../../core/src/messaging/outbound.js';
import type { BotHarnessTranslate } from './locale.js';
import { GroupReceptionSettings } from './messaging-grant.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';

type Grant = MessagingSnapshot['grants'][number];
type Held = NonNullable<MessagingSnapshot['heldConversations']>[number];
type Blocked = NonNullable<MessagingSnapshot['blockedConversations']>[number];

const LIMITS = { 'hourly-limit': 20, 'active-limit': 500 } as const;

export function ExternalConversations({
  identity,
  snapshot,
  busy,
  t,
  change,
  rules,
}: {
  identity: MessagingIdentityView;
  snapshot: MessagingSnapshot | undefined;
  busy: boolean;
  t: BotHarnessTranslate;
  change(input: MessagingConversationInput): Promise<void>;
  rules(grantId: string, input: GroupReceptionInput): Promise<void>;
}): ReactElement {
  const [open, setOpen] = useState<string>();
  const [confirm, setConfirm] = useState<string>();
  const time = (value: string) => new Date(value).toLocaleString();
  const entries = (snapshot?.grants ?? []).filter(
    (g) => g.bindingId === identity.id && !g.revokedAt && g.receiveScope !== undefined,
  );
  const active = entries.filter((g) => !g.muted);
  const muted = entries.filter((g) => g.muted);
  const waiting = (snapshot?.heldConversations ?? []).filter((h) => h.bindingId === identity.id);
  const blocked = (snapshot?.blockedConversations ?? []).filter((b) => b.bindingId === identity.id);
  const kind = (value: 'dm' | 'group') =>
    t(value === 'dm' ? 'identity.kind.dm' : 'identity.kind.group');
  const icon = (value: 'dm' | 'group') => (value === 'dm' ? 'user' : 'users');
  const small = (label: string, onClick: () => void, danger = false, pressed?: boolean) => (
    <Button
      size="sm"
      variant="ghost"
      className={danger ? 'bh-im-danger-text' : undefined}
      aria-pressed={pressed}
      disabled={busy}
      onClick={onClick}
    >
      {label}
    </Button>
  );
  const confirmBlock = (key: string, name: string, block: () => void): ReactNode =>
    confirm === key ? (
      <div
        className="bh-conversation-confirm"
        role="alertdialog"
        aria-label={t('conversation.block')}
      >
        <p>{t('conversation.blockConfirm', { name })}</p>
        <div className="bh-modal-footer">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirm(undefined)}>
            {t('common.cancel')}
          </Button>
          <Button
            size="sm"
            variant="primary"
            className="bh-im-danger"
            disabled={busy}
            onClick={() => {
              setConfirm(undefined);
              block();
            }}
          >
            {t('conversation.confirmBlock')}
          </Button>
        </div>
      </div>
    ) : undefined;
  const entryRow = (grant: Grant) => {
    const scope = grant.receiveScope!;
    const name = grant.targetName || scope.conversationId;
    const detail =
      confirmBlock(
        grant.id,
        name,
        () => void change({ kind: 'block', grantId: grant.id, expectedRevision: grant.revision }),
      ) ??
      (open === grant.id && grant.groupPolicy ? (
        <GroupReceptionSettings
          key={`${grant.id}:${grant.groupPolicy.revision}:${grant.groupPolicy.defaultRevision ?? 0}`}
          policy={grant.groupPolicy}
          verified={grant.ordinaryDelivery === 'verified'}
          busy={busy}
          t={t}
          save={(input) => rules(grant.id, input)}
        />
      ) : undefined);
    return (
      <SidebarCardRow
        key={grant.id}
        icon={icon(scope.kind)}
        title={name}
        meta={[
          kind(scope.kind),
          ...(grant.lastMessageAt
            ? [t('identity.lastMessage', { time: time(grant.lastMessageAt) })]
            : []),
        ].join(' · ')}
        muted={grant.muted}
        trailing={
          <>
            {small(
              t(grant.muted ? 'conversation.unmute' : 'conversation.mute'),
              () =>
                void change({
                  kind: 'mute',
                  grantId: grant.id,
                  expectedRevision: grant.preferenceRevision ?? 0,
                  muted: !grant.muted,
                }),
            )}
            {grant.groupPolicy
              ? small(
                  t('conversation.rules'),
                  () => {
                    setConfirm(undefined);
                    setOpen(open === grant.id ? undefined : grant.id);
                  },
                  false,
                  open === grant.id,
                )
              : null}
            {small(t('conversation.block'), () => setConfirm(grant.id), true)}
          </>
        }
        detail={detail}
      />
    );
  };
  const heldRow = (held: Held) => {
    const key = `held:${held.conversation.kind}:${held.conversation.id}`;
    const reason =
      held.reason === 'ask'
        ? t('conversation.reason.ask')
        : t(`conversation.reason.${held.reason}`, { count: LIMITS[held.reason] });
    return (
      <SidebarCardRow
        key={key}
        icon={icon(held.conversation.kind)}
        title={held.name}
        chips={<span className="bh-conversation-reason">{reason}</span>}
        meta={[
          kind(held.conversation.kind),
          t('conversation.seen', { count: held.count, time: time(held.lastSeenAt) }),
        ].join(' · ')}
        trailing={
          <>
            {small(
              t('conversation.allow'),
              () =>
                void change({
                  kind: 'allow',
                  bindingId: identity.id,
                  conversation: held.conversation,
                  from: 'held',
                  expectedRevision: held.revision,
                }),
            )}
            {small(t('conversation.block'), () => setConfirm(key), true)}
          </>
        }
        detail={confirmBlock(
          key,
          held.name,
          () =>
            void change({
              kind: 'block-held',
              bindingId: identity.id,
              conversation: held.conversation,
              expectedRevision: held.revision,
            }),
        )}
      />
    );
  };
  const blockedRow = (block: Blocked) => (
    <SidebarCardRow
      key={`blocked:${block.conversation.kind}:${block.conversation.id}`}
      icon={icon(block.conversation.kind)}
      title={block.name || block.conversation.id}
      meta={[
        kind(block.conversation.kind),
        t('conversation.blockedAt', { time: time(block.blockedAt) }),
      ].join(' · ')}
      muted
      trailing={small(
        t('conversation.allowAgain'),
        () =>
          void change({
            kind: 'allow',
            bindingId: identity.id,
            conversation: block.conversation,
            from: 'blocked',
            expectedRevision: block.revision,
          }),
      )}
    />
  );
  const group = (label: string, rows: ReactElement[]) =>
    rows.length ? (
      <section className="bh-conversation-group" aria-label={label}>
        <span className="bh-conversation-group-title">
          {label} <small>{rows.length}</small>
        </span>
        <SidebarCardList label={label}>{rows}</SidebarCardList>
      </section>
    ) : null;
  if (!entries.length && !waiting.length && !blocked.length)
    return <p className="bh-muted">{t('identity.conversationsEmpty')}</p>;
  return (
    <>
      {group(t('conversation.waiting'), waiting.map(heldRow))}
      {group(t('conversation.active'), active.map(entryRow))}
      {group(t('conversation.muted'), muted.map(entryRow))}
      {group(t('conversation.blocked'), blocked.map(blockedRow))}
    </>
  );
}
