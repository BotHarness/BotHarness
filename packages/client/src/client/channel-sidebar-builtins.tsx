import { useState, useSyncExternalStore, type ReactElement } from 'react';

import { Tag } from '@deepseek-ai/dsh-client-ui-primitives';

import { PersonaBotAvatar } from './avatar.js';
import type { BotModePrefs } from './bot-mode-prefs.js';
import { WorkspaceGrantsEntry } from './workspace-grants-entry.js';
import { useClientState } from './bot-sidebar.js';
import type { ChannelSidebarEntry, ChannelSidebarEntryProps } from './channel-sidebar.js';
import { formatRelativeTime } from './labels.js';
import { MemoryEntry } from './memory-entry.js';
import { personaBotActivity } from './persona-activity.js';
import type { BotHarnessTranslate } from './locale.js';
import type { BotSummary } from './store.js';

const inactiveSubscribe = (): (() => void) => () => {};

function memberName(bots: readonly BotSummary[], slug: string): string {
  return bots.find((bot) => bot.slug === slug)?.displayName ?? slug;
}

function assignmentStatus(activity: 'working' | 'idle' | 'error', t: BotHarnessTranslate): string {
  switch (activity) {
    case 'working':
      return t('assignment.state.working');
    case 'idle':
      return t('assignment.state.reported');
    case 'error':
      return t('assignment.state.error');
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
          <div className="bh-member-row" key={slug}>
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
