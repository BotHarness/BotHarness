import type { ReactElement } from 'react';

import { Tag } from '@deepseek-ai/dsh-client-ui-primitives';

import { PersonaBotAvatar } from './avatar.js';
import { WorkspaceGrantsEntry } from './workspace-grants-entry.js';
import { useClientState } from './bot-sidebar.js';
import type { ChannelSidebarEntry, ChannelSidebarEntryProps } from './channel-sidebar.js';
import { formatRelativeTime } from './labels.js';
import { MemoryEntry } from './memory-entry.js';
import { personaBotActivity } from './persona-activity.js';
import type { BotHarnessTranslate } from './locale.js';
import type { BotSummary } from './store.js';

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

function MembersEntry({ t }: ChannelSidebarEntryProps): ReactElement {
  const state = useClientState();
  const members = state.conversation.channel?.members ?? [];
  if (members.length === 0) {
    return <div className="bh-note">{t('members.empty')}</div>;
  }
  return (
    <>
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
          </div>
        );
      })}
    </>
  );
}

function MembersBadge(): ReactElement {
  return <Tag tone="neutral">{useClientState().conversation.channel?.members.length ?? 0}</Tag>;
}

/** Entries BotHarness itself contributes to the Channel sidebar. */
export function createChannelSidebarBuiltins(
  t: BotHarnessTranslate,
): readonly ChannelSidebarEntry[] {
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
      component: WorkspaceGrantsEntry,
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
