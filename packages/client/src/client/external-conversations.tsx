import { useState, type ReactElement, type ReactNode } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MessagingConversationInput } from '../../../core/src/messaging/conversations.js';
import type { GroupReceptionInput } from '../../../core/src/messaging/group-policy.js';
import type { MessagingIdentityView } from '../../../core/src/messaging/identity.js';
import type { MessagingSnapshot } from '../../../core/src/messaging/outbound.js';
import type { BotHarnessTranslate } from './locale.js';
import { Combobox } from './combobox.js';
import { GroupReceptionSettings } from './messaging-grant.js';
import { MessagingHelp } from './messaging-help.js';
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
  channels = [],
  sync,
}: {
  identity: MessagingIdentityView;
  snapshot: MessagingSnapshot | undefined;
  busy: boolean;
  t: BotHarnessTranslate;
  change(input: MessagingConversationInput): Promise<void>;
  rules(grantId: string, input: GroupReceptionInput): Promise<void>;
  channels?: { id: string; name: string }[];
  sync?(grant: Grant, channelId: string): Promise<void>;
}): ReactElement {
  const [open, setOpen] = useState<string>();
  const [syncing, setSyncing] = useState<string>();
  const [channelId, setChannelId] = useState('');
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
  const actions = (label: string, buttons: ReactNode, panel?: ReactNode): ReactNode => (
    <>
      <div className="bh-conversation-actions" role="group" aria-label={label}>
        {buttons}
      </div>
      {panel}
    </>
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
  const synced = (grant: Grant) =>
    (grant.bridgeRoutes ?? [])
      .map((route) => channels.find((c) => c.id === route.channelId)?.name)
      .filter((name): name is string => name !== undefined);
  const syncDetail = (grant: Grant): ReactNode =>
    syncing === grant.id && sync ? (
      <div className="bh-conversation-sync">
        <span className="bh-conversation-sync-title">
          {t('conversation.syncTarget')}
          <MessagingHelp
            title={t('conversation.syncTarget')}
            text={t('conversation.syncHint')}
            t={t}
          />
        </span>
        <Combobox
          label={t('conversation.syncTarget')}
          toggleLabel={t('conversation.syncTarget')}
          placeholder={t('im.select')}
          emptyLabel={t('conversation.syncEmpty')}
          value={channelId}
          disabled={busy}
          onSelect={setChannelId}
          options={channels.map((c) => ({
            value: c.id,
            label: c.name,
            disabled: (grant.bridgeRoutes ?? []).some((route) => route.channelId === c.id),
          }))}
        />
        <div className="bh-modal-footer">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setSyncing(undefined)}>
            {t('common.cancel')}
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={busy || !channelId}
            onClick={() => {
              const target = channelId;
              setSyncing(undefined);
              void sync(grant, target);
            }}
          >
            {t('conversation.syncConfirm')}
          </Button>
        </div>
      </div>
    ) : undefined;
  const entryRow = (grant: Grant) => {
    const scope = grant.receiveScope!;
    const name = grant.targetName || scope.conversationId;
    const panel =
      syncDetail(grant) ??
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
          ...(synced(grant).length
            ? [t('conversation.syncedTo', { names: synced(grant).join('、') })]
            : []),
        ].join(' · ')}
        muted={grant.muted}
        detail={actions(
          name,
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
                    setSyncing(undefined);
                    setOpen(open === grant.id ? undefined : grant.id);
                  },
                  false,
                  open === grant.id,
                )
              : null}
            {sync && (scope.kind === 'group' || grant.platform === 'weixin')
              ? small(
                  t('conversation.sync'),
                  () => {
                    setConfirm(undefined);
                    setOpen(undefined);
                    setChannelId('');
                    setSyncing(syncing === grant.id ? undefined : grant.id);
                  },
                  false,
                  syncing === grant.id,
                )
              : null}
            {small(t('conversation.block'), () => setConfirm(grant.id), true)}
          </>,
          panel,
        )}
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
        detail={actions(
          held.name,
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
          </>,
          confirmBlock(
            key,
            held.name,
            () =>
              void change({
                kind: 'block-held',
                bindingId: identity.id,
                conversation: held.conversation,
                expectedRevision: held.revision,
              }),
          ),
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
      detail={actions(
        block.name || block.conversation.id,
        small(
          t('conversation.allowAgain'),
          () =>
            void change({
              kind: 'allow',
              bindingId: identity.id,
              conversation: block.conversation,
              from: 'blocked',
              expectedRevision: block.revision,
            }),
        ),
      )}
    />
  );
  const group = (label: string, rows: ReactElement[]) =>
    rows.length ? (
      <section className="bh-conversation-group" aria-label={label}>
        <span className="bh-conversation-group-title">
          {label} <small>{rows.length}</small>
        </span>
        <SidebarCardList label={label} className="bh-conversation-list">
          {rows}
        </SidebarCardList>
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
