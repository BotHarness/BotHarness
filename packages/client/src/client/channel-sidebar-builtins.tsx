import type { ReactElement } from 'react';

import { Tag } from '@deepseek-ai/dsh-client-ui-primitives';

import { PersonaBotAvatar } from './avatar.js';
import { useClientState } from './bot-sidebar.js';
import type { ChannelSidebarEntry, ChannelSidebarEntryProps } from './channel-sidebar.js';
import { formatRelativeTime } from './labels.js';
import { personaBotActivity } from './persona-activity.js';
import type { BotSummary } from './store.js';

function memberName(bots: readonly BotSummary[], slug: string): string {
  return bots.find((bot) => bot.slug === slug)?.displayName ?? slug;
}

function assignmentStatus(activity: 'working' | 'idle' | 'error'): string {
  switch (activity) {
    case 'working':
      return '进行中';
    case 'idle':
      return '已报告';
    case 'error':
      return '出错';
  }
}

function AssignmentsEntry({ actions }: ChannelSidebarEntryProps): ReactElement {
  const assignments = useClientState().assignments;
  const selected = assignments.selected;
  return (
    <>
      {assignments.status === 'loading' ? <div className="bh-note">正在加载事项…</div> : null}
      {assignments.status === 'error' && assignments.error !== undefined ? (
        <div className="bh-error">事项加载失败：{assignments.error}</div>
      ) : null}
      {assignments.status === 'ready' && assignments.items.length === 0 ? (
        <div className="bh-note">还没有事项。直接在左侧聊天，Bot 会按需自行安排。</div>
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
            <span>{assignmentStatus(assignment.activity)}</span>
            <span>{formatRelativeTime(Date.parse(assignment.updatedAt), Date.now())}</span>
          </div>
          {assignment.latestReport === undefined ? null : (
            <div className="bh-assignment-summary">{assignment.latestReport.summary}</div>
          )}
        </button>
      ))}
      {selected === undefined ? null : (
        <section className="bh-assignment-detail" aria-label="事项详情">
          <div className="bh-assignment-detail-label">事项详情</div>
          <div className="bh-assignment-detail-purpose">{selected.purpose}</div>
          <dl>
            <div>
              <dt>状态</dt>
              <dd>{assignmentStatus(selected.activity)}</dd>
            </div>
            <div>
              <dt>最近报告</dt>
              <dd>{selected.latestReport?.summary ?? '尚未报告'}</dd>
            </div>
            <div>
              <dt>Assignment Session</dt>
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

function MembersEntry(): ReactElement {
  const state = useClientState();
  const members = state.conversation.channel?.members ?? [];
  if (members.length === 0) {
    return <div className="bh-note">还没有成员。Bot 参与群聊随 v1.1 到来。</div>;
  }
  return (
    <>
      {members.map((slug) => {
        const member = state.bots.find((candidate) => candidate.slug === slug);
        return (
          <div className="bh-member-row" key={slug}>
            <PersonaBotAvatar
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
export const channelSidebarBuiltins: readonly ChannelSidebarEntry[] = [
  {
    id: 'assignments',
    label: '事项',
    order: 10,
    scope: 'personabot',
    component: AssignmentsEntry,
    badge: AssignmentsBadge,
  },
  {
    id: 'members',
    label: '成员',
    order: 10,
    scope: 'channel',
    component: MembersEntry,
    badge: MembersBadge,
  },
];
