import { useState, useSyncExternalStore, type ReactElement } from 'react';

import { Input, Tag } from '@deepseek-ai/dsh-client-ui-primitives';

import { PersonaBotAvatar } from './avatar.js';
import type { BotModePrefs } from './bot-mode-prefs.js';
import { WorkspaceGrantsEntry } from './workspace-grants-entry.js';
import { useClientState } from './bot-sidebar.js';
import type { ChannelSidebarEntry, ChannelSidebarEntryProps } from './channel-sidebar.js';
import { formatRelativeTime } from './labels.js';
import { MemoryEntry } from './memory-entry.js';
import { personaBotActivity } from './persona-activity.js';
import type { BotHarnessTranslate } from './locale.js';
import type { BotAttentionItem, BotSummary, ChannelSummary } from './store.js';

const inactiveSubscribe = (): (() => void) => () => {};

function memberName(bots: readonly BotSummary[], slug: string): string {
  return bots.find((bot) => bot.slug === slug)?.displayName ?? slug;
}

function assignmentStatus(
  activity: 'working' | 'idle' | 'error' | 'stopping' | 'stopped',
  t: BotHarnessTranslate,
): string {
  switch (activity) {
    case 'working':
      return t('assignment.state.working');
    case 'idle':
      return t('assignment.state.reported');
    case 'error':
      return t('assignment.state.error');
    case 'stopping':
      return t('assignment.state.stopping');
    case 'stopped':
      return t('assignment.state.stopped');
  }
}

function AssignmentsEntry({ actions, t }: ChannelSidebarEntryProps): ReactElement {
  const assignments = useClientState().assignments;
  const selected = assignments.selected;
  return (
    <>
      {assignments.status === 'loading' ? (
        <div className="bh-note">{t('assignments.loading')}</div>
      ) : null}
      {assignments.status === 'error' && assignments.error !== undefined ? (
        <div className="bh-error">{t('assignments.error', { error: assignments.error })}</div>
      ) : null}
      {assignments.status === 'ready' && assignments.items.length === 0 ? (
        <div className="bh-note">{t('assignments.empty')}</div>
      ) : null}
      {assignments.items.map((assignment) => (
        <button
          type="button"
          className={
            assignment.sessionId === selected?.sessionId
              ? 'bh-assignment-row bh-assignment-row-selected'
              : 'bh-assignment-row'
          }
          key={assignment.sessionId}
          aria-pressed={assignment.sessionId === selected?.sessionId}
          onClick={() => void actions.openAssignment(assignment.sessionId)}
        >
          <div className="bh-assignment-title">{assignment.purpose}</div>
          <div className="bh-assignment-meta">
            <span>{assignmentStatus(assignment.activity, t)}</span>
            <span>{formatRelativeTime(Date.parse(assignment.updatedAt), Date.now(), t)}</span>
          </div>
          {assignment.permission === undefined ? null : (
            <div className="bh-assignment-meta">
              <span>{assignment.permission.primaryCwd}</span>
              <Tag tone="neutral">{assignment.permission.mode}</Tag>
            </div>
          )}
          {assignment.latestReport === undefined ? null : (
            <div className="bh-assignment-summary">{assignment.latestReport.summary}</div>
          )}
        </button>
      ))}
      {selected === undefined ? null : (
        <section className="bh-assignment-detail" aria-label={t('assignment.detail.label')}>
          <div className="bh-assignment-detail-label">{t('assignment.detail.label')}</div>
          <div className="bh-assignment-detail-purpose">{selected.purpose}</div>
          <dl>
            <div>
              <dt>{t('assignment.detail.status')}</dt>
              <dd>{assignmentStatus(selected.activity, t)}</dd>
            </div>
            <div>
              <dt>{t('assignment.detail.latest')}</dt>
              <dd>{selected.latestReport?.summary ?? t('assignment.detail.unreported')}</dd>
            </div>
            {selected.permission === undefined ? null : (
              <>
                <div>
                  <dt>{t('grant.primaryCwd')}</dt>
                  <dd>{selected.permission.primaryCwd}</dd>
                </div>
                <div>
                  <dt>{t('grant.actualPermission')}</dt>
                  <dd>
                    {selected.permission.mode} / {selected.permission.approval}
                  </dd>
                </div>
                {selected.permission.mode === 'danger-full-access' ? (
                  <div className="bh-access-warning" role="status">
                    {t('access.sessionWarning')}
                  </div>
                ) : null}
                <div>
                  <dt>{t('grant.source')}</dt>
                  <dd>{selected.permission.grantId}</dd>
                </div>
              </>
            )}
            <div>
              <dt>{t('assignment.detail.session')}</dt>
              <dd className="bh-assignment-id" title={selected.sessionId}>
                {selected.sessionId}
              </dd>
            </div>
          </dl>
        </section>
      )}
    </>
  );
}

function AssignmentsBadge(): ReactElement {
  return <Tag tone="neutral">{useClientState().assignments.items.length}</Tag>;
}

function MemberWakeControls({
  channel,
  slug,
  actions,
  t,
  apply,
}: {
  channel: ChannelSummary;
  slug: string;
  actions: ChannelSidebarEntryProps['actions'];
  t: BotHarnessTranslate;
  apply: (result: Promise<boolean>) => Promise<void>;
}): ReactElement {
  const saved = channel.wakePolicies?.[slug];
  const [mode, setMode] = useState<'mentions' | 'digest' | 'silent'>(saved?.mode ?? 'mentions');
  const [count, setCount] = useState(saved?.count ?? 5);
  const [seconds, setSeconds] = useState(saved?.intervalSeconds ?? 30);
  const [busy, setBusy] = useState(false);
  const prefix = `bh-wake-${channel.id}-${slug}`;
  const save = async (): Promise<void> => {
    setBusy(true);
    try {
      await apply(
        actions.setGroupWakePolicy(channel.id, slug, {
          mode,
          count,
          intervalSeconds: seconds,
        }),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="bh-member-wake">
      <summary>
        {t('members.wake')} ·{' '}
        {saved?.mode === 'digest'
          ? t('members.wake.digest')
          : saved?.mode === 'silent'
            ? t('members.wake.silent')
            : t('members.wake.mentions')}
      </summary>
      <div className="bh-member-wake-form">
        <div className="bh-member-wake-choices" role="group" aria-label={t('members.wake')}>
          <button
            type="button"
            className="bh-group-manage-button"
            aria-pressed={mode === 'mentions'}
            onClick={() => setMode('mentions')}
          >
            {t('members.wake.mentions')}
          </button>
          <button
            type="button"
            className="bh-group-manage-button"
            aria-pressed={mode === 'digest'}
            onClick={() => setMode('digest')}
          >
            {t('members.wake.digest')}
          </button>
          <button
            type="button"
            className="bh-group-manage-button"
            aria-pressed={mode === 'silent'}
            onClick={() => setMode('silent')}
          >
            {t('members.wake.silent')}
          </button>
        </div>
        {mode === 'digest' ? (
          <div className="bh-member-wake-values">
            <label htmlFor={prefix + '-count'}>{t('members.wake.count')}</label>
            <Input
              id={prefix + '-count'}
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
            />
            <label htmlFor={prefix + '-seconds'}>{t('members.wake.seconds')}</label>
            <Input
              id={prefix + '-seconds'}
              type="number"
              min={1}
              max={3600}
              value={seconds}
              onChange={(event) => setSeconds(Number(event.target.value))}
            />
          </div>
        ) : null}
        <button
          type="button"
          className="bh-group-manage-button"
          disabled={
            busy ||
            !Number.isSafeInteger(count) ||
            count < 1 ||
            count > 100 ||
            !Number.isSafeInteger(seconds) ||
            seconds < 1 ||
            seconds > 3600
          }
          onClick={() => void save()}
        >
          {t('members.wake.save')}
        </button>
      </div>
    </details>
  );
}

function MembersEntry({ actions, t }: ChannelSidebarEntryProps): ReactElement {
  const state = useClientState();
  const channel = state.conversation.channel;
  const members = channel?.members ?? [];
  const group = channel?.type === 'group' ? channel : undefined;
  const [error, setError] = useState(false);
  const invitationLabels = {
    pending: t('members.pending'),
    accepted: t('members.accepted'),
    declined: t('members.declined'),
    cancelled: t('members.cancelled'),
  };
  const apply = async (result: Promise<boolean>): Promise<void> => {
    setError(!(await result));
  };
  return (
    <>
      {members.length === 0 ? <div className="bh-note">{t('members.empty')}</div> : null}
      {members.map((slug) => {
        const member = state.bots.find((candidate) => candidate.slug === slug);
        return (
          <div className="bh-member-with-wake" key={slug}>
            <div className="bh-member-row">
              <PersonaBotAvatar
                t={t}
                personaBotId={slug}
                name={member?.displayName ?? slug}
                src={member?.avatar}
                state={member === undefined ? 'idle' : personaBotActivity(state, member)}
                size={26}
              />
              <span className="bh-name">{memberName(state.bots, slug)}</span>
              {group?.ownerBotSlug === slug ? <Tag tone="neutral">{t('members.owner')}</Tag> : null}
              {group === undefined ? null : (
                <button
                  type="button"
                  className="bh-group-manage-button"
                  aria-label={t('members.remove') + ' ' + memberName(state.bots, slug)}
                  onClick={() => void apply(actions.removeGroupMember(group.id, slug))}
                >
                  {t('members.remove')}
                </button>
              )}
            </div>
            {group === undefined ? null : (
              <MemberWakeControls
                key={group.wakePolicies?.[slug]?.revision ?? 0}
                channel={group}
                slug={slug}
                actions={actions}
                t={t}
                apply={apply}
              />
            )}
          </div>
        );
      })}
      {group?.invitations?.length ? (
        <div className="bh-group-invitations">
          <div className="bh-group-invitations-title">{t('members.invites')}</div>
          {group.invitations.map((invitation) => (
            <div className="bh-member-row" key={invitation.id}>
              <PersonaBotAvatar
                t={t}
                personaBotId={invitation.targetBotSlug}
                name={memberName(state.bots, invitation.targetBotSlug)}
                src={state.bots.find((bot) => bot.slug === invitation.targetBotSlug)?.avatar}
                size={26}
              />
              <span className="bh-name">{memberName(state.bots, invitation.targetBotSlug)}</span>
              <Tag tone="neutral">{invitationLabels[invitation.status]}</Tag>
              {invitation.status === 'pending' ? (
                <button
                  type="button"
                  className="bh-group-manage-button"
                  onClick={() => void apply(actions.cancelGroupInvitation(group.id, invitation.id))}
                >
                  {t('members.cancel')}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {group?.joinRequests?.length ? (
        <div className="bh-group-invitations">
          <div className="bh-group-invitations-title">{t('members.joinRequests')}</div>
          {group.joinRequests.map((request) => (
            <div className="bh-member-row" key={request.id}>
              <PersonaBotAvatar
                t={t}
                personaBotId={request.requesterBotSlug}
                name={memberName(state.bots, request.requesterBotSlug)}
                src={state.bots.find((bot) => bot.slug === request.requesterBotSlug)?.avatar}
                size={26}
              />
              <span className="bh-name">{memberName(state.bots, request.requesterBotSlug)}</span>
              <Tag tone="neutral">
                {request.status === 'pending'
                  ? t('members.joinPending')
                  : invitationLabels[request.status]}
              </Tag>
              {request.status === 'pending' ? (
                <>
                  <button
                    type="button"
                    className="bh-group-manage-button"
                    onClick={() => void apply(actions.decideGroupJoin(group.id, request.id, true))}
                  >
                    {t('members.approve')}
                  </button>
                  <button
                    type="button"
                    className="bh-group-manage-button"
                    onClick={() => void apply(actions.decideGroupJoin(group.id, request.id, false))}
                  >
                    {t('members.reject')}
                  </button>
                </>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {group === undefined ? null : (
        <button
          type="button"
          className="bh-group-delete-button"
          onClick={() => {
            if (!window.confirm(t('members.deleteConfirm', { name: group.name }))) return;
            void apply(actions.deleteGroupChannel(group.id));
          }}
        >
          {t('members.delete')}
        </button>
      )}
      {error ? (
        <div className="bh-error" role="alert">
          {t('members.error')}
        </div>
      ) : null}
    </>
  );
}

function MembersBadge(): ReactElement {
  return <Tag tone="neutral">{useClientState().conversation.channel?.members.length ?? 0}</Tag>;
}

function BotInboxItemRow({
  item,
  actions,
  t,
}: {
  item: BotAttentionItem;
  actions: ChannelSidebarEntryProps['actions'];
  t: BotHarnessTranslate;
}): ReactElement {
  const author =
    item.authorKind === 'human'
      ? t('main.author.human')
      : item.authorKind === 'bot'
        ? (item.authorBotSlug ?? t('inbox.bot'))
        : t('inbox.system');
  const open = async (): Promise<void> => {
    if (
      !item.sourceAvailable ||
      item.sourceChannelId === undefined ||
      item.sourceMessageId === undefined
    )
      return;
    await actions.openChannel(item.sourceChannelId);
    await actions.openAround(item.sourceChannelId, item.sourceMessageId);
  };
  return (
    <button
      type="button"
      className="bh-inbox-item"
      disabled={!item.sourceAvailable}
      onClick={() => void open()}
    >
      <span className="bh-inbox-item-top">
        <span>{author}</span>
        <Tag tone="neutral">{t(`inbox.state.${item.state}`)}</Tag>
      </span>
      <span className="bh-inbox-item-summary">{item.summary || t('inbox.system')}</span>
      <span className="bh-inbox-item-meta">
        {formatRelativeTime(Date.parse(item.createdAt), Date.now(), t)}
        {!item.sourceAvailable ? ` · ${t('inbox.sourceUnavailable')}` : ''}
      </span>
    </button>
  );
}

function BotInboxGroup({
  name,
  items,
  actions,
  t,
}: {
  name: string;
  items: BotAttentionItem[];
  actions: ChannelSidebarEntryProps['actions'];
  t: BotHarnessTranslate;
}): ReactElement {
  const active = items.filter((item) => item.state !== 'handled');
  const history = items.filter((item) => item.state === 'handled');
  const [expanded, setExpanded] = useState(active.length > 0);
  return (
    <details
      className="bh-inbox-group"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className="bh-inbox-group-head">
        <span>{name}</span>
        <Tag tone="neutral">{items.length}</Tag>
      </summary>
      {active.map((item) => (
        <BotInboxItemRow key={item.id} item={item} actions={actions} t={t} />
      ))}
      {history.length > 0 ? (
        <details className="bh-inbox-history">
          <summary>{t('inbox.handledHistory', { count: history.length })}</summary>
          {history.map((item) => (
            <BotInboxItemRow key={item.id} item={item} actions={actions} t={t} />
          ))}
        </details>
      ) : null}
    </details>
  );
}
function BotInboxEntry({ actions, t, botSlug }: ChannelSidebarEntryProps): ReactElement {
  const inbox = useClientState().botInbox;
  const groups = new Map<string, { name: string; items: BotAttentionItem[] }>();
  for (const item of inbox.items) {
    const key = item.sourceChannelId ?? `system:${item.reason}`;
    const group = groups.get(key) ?? {
      name: item.sourceChannelName ?? item.sourceChannelId ?? t('inbox.system'),
      items: [],
    };
    group.items.push(item);
    groups.set(key, group);
  }
  return (
    <>
      {inbox.status === 'loading' ? <div className="bh-note">{t('inbox.loading')}</div> : null}
      {inbox.status === 'error' ? (
        <div className="bh-error" role="alert">
          {t('inbox.error', { error: inbox.error ?? '' })}
        </div>
      ) : null}
      {[...groups.entries()].map(([key, group]) => (
        <BotInboxGroup key={key} name={group.name} items={group.items} actions={actions} t={t} />
      ))}
      {inbox.nextCursor !== undefined && botSlug !== undefined ? (
        <button
          type="button"
          className="bh-group-manage-button"
          onClick={() => void actions.loadMoreBotInbox(botSlug)}
        >
          {t('inbox.more')}
        </button>
      ) : null}
    </>
  );
}

function BotInboxBadge(): ReactElement {
  const items = useClientState().botInbox.items;
  return <Tag tone="neutral">{items.filter((item) => item.state !== 'handled').length}</Tag>;
}

/** Entries BotHarness itself contributes to the Channel sidebar. */
export function createChannelSidebarBuiltins(
  t: BotHarnessTranslate,
  prefs?: BotModePrefs,
): readonly ChannelSidebarEntry[] {
  function WorkspaceGrantsWithPrefs(props: ChannelSidebarEntryProps): ReactElement {
    const developerMode = useSyncExternalStore(
      prefs?.source.subscribe ?? inactiveSubscribe,
      () => prefs?.source.getSnapshot().developerMode ?? false,
    );
    return <WorkspaceGrantsEntry {...props} developerMode={developerMode} />;
  }
  return [
    {
      id: 'memory',
      label: t('entry.memory'),
      order: 5,
      scope: 'personabot',
      component: MemoryEntry,
    },
    {
      id: 'assignments',
      label: t('entry.assignments'),
      order: 10,
      scope: 'personabot',
      component: AssignmentsEntry,
      badge: AssignmentsBadge,
    },
    {
      id: 'bot-inbox',
      label: t('entry.botInbox'),
      order: 15,
      scope: 'personabot',
      component: BotInboxEntry,
      badge: BotInboxBadge,
      visible: (state) =>
        state.botInbox.status === 'loading' ||
        state.botInbox.status === 'error' ||
        state.botInbox.items.length > 0,
    },
    {
      id: 'workspace-grants',
      label: t('entry.workspaceGrants'),
      order: 20,
      scope: 'personabot',
      component: WorkspaceGrantsWithPrefs,
    },
    {
      id: 'members',
      label: t('entry.members'),
      order: 10,
      scope: 'channel',
      component: MembersEntry,
      badge: MembersBadge,
    },
  ];
}
