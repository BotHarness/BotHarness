import type { ReactElement } from 'react';

import type { ProfileActivityDay, ProfileActivityReasonDay } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import type { ProfileCardDescriptor } from './profile-cards.js';

/** Activity windows follow the Profile decision: 26 weeks in the Host-local calendar. */
export const PROFILE_ACTIVITY_WEEKS = 26;

const HEAT_LEVEL_THRESHOLDS = [1, 3, 6, 11] as const;

function localDayKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Monday-aligned columns; days after today render as blank future cells. */
function heatWindow(today: Date): { days: string[]; todayKey: string } {
  const start = new Date(today);
  const mondayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayOffset - (PROFILE_ACTIVITY_WEEKS - 1) * 7);
  const days: string[] = [];
  for (let index = 0; index < PROFILE_ACTIVITY_WEEKS * 7; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    days.push(localDayKey(date));
  }
  return { days, todayKey: localDayKey(today) };
}

function heatLevel(count: number): number {
  let level = 0;
  for (const threshold of HEAT_LEVEL_THRESHOLDS) {
    if (count >= threshold) level += 1;
  }
  return level;
}

function countByDay(days: readonly ProfileActivityDay[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of days) {
    counts.set(entry.day, (counts.get(entry.day) ?? 0) + entry.count);
  }
  return counts;
}

function sumCounts(days: readonly ProfileActivityDay[]): number {
  return days.reduce((total, entry) => total + entry.count, 0);
}

function ProfileHeatmap({
  counts,
  label,
  t,
}: {
  counts: ReadonlyMap<string, number>;
  label: string;
  t: BotHarnessTranslate;
}): ReactElement {
  const { days, todayKey } = heatWindow(new Date());
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  return (
    <div className="bh-profile-heat">
      <div
        className="bh-profile-heat-grid"
        role="img"
        aria-label={t('profile.heat.aria', { label })}
      >
        {days.map((day) => {
          const future = day > todayKey;
          const count = counts.get(day) ?? 0;
          return (
            <span
              key={day}
              className="bh-profile-heat-cell"
              data-level={future ? 'future' : heatLevel(count)}
              title={future ? undefined : `${day} · ${count}`}
            />
          );
        })}
      </div>
      {total === 0 ? <div className="bh-profile-empty">{t('profile.empty')}</div> : null}
    </div>
  );
}

function reasonLabel(reason: string, t: BotHarnessTranslate): string {
  switch (reason) {
    case 'human-dm':
      return t('profile.reason.humanDm');
    case 'group-mention':
      return t('profile.reason.groupMention');
    case 'group-ordinary':
      return t('profile.reason.groupOrdinary');
    case 'bot-dm':
      return t('profile.reason.botDm');
    case 'group-invite':
      return t('profile.reason.groupInvite');
    case 'group-join-request':
    case 'group-join-decision':
      return t('profile.reason.groupJoin');
    case 'assignment-report':
      return t('profile.reason.assignmentReport');
    default:
      return reason;
  }
}

function reasonTotals(
  events: readonly ProfileActivityReasonDay[],
): Array<{ reason: string; count: number }> {
  const totals = new Map<string, number>();
  for (const entry of events) {
    totals.set(entry.reason, (totals.get(entry.reason) ?? 0) + entry.count);
  }
  return [...totals]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count);
}

function EventActivityCard({
  activity,
  t,
}: Parameters<ProfileCardDescriptor['render']>[0]): ReactElement {
  const events = activity?.events ?? [];
  const weeks = activity?.weeks ?? PROFILE_ACTIVITY_WEEKS;
  const reasons = reasonTotals(events);
  return (
    <div className="bh-profile-card-body">
      <div className="bh-profile-card-total">{totalText(sumCounts(events), weeks, t)}</div>
      <ProfileHeatmap counts={countByDay(events)} label={t('profile.card.events')} t={t} />
      {reasons.length === 0 ? null : (
        <ul className="bh-profile-reasons">
          {reasons.map((entry) => (
            <li key={entry.reason}>
              <span>{reasonLabel(entry.reason, t)}</span>
              <span className="bh-profile-reason-count">{entry.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MemoryActivityCard({
  activity,
  t,
}: Parameters<ProfileCardDescriptor['render']>[0]): ReactElement {
  const commits = activity?.memoryCommits ?? [];
  const weeks = activity?.weeks ?? PROFILE_ACTIVITY_WEEKS;
  return (
    <div className="bh-profile-card-body">
      <div className="bh-profile-card-total">{totalText(sumCounts(commits), weeks, t)}</div>
      <ProfileHeatmap counts={countByDay(commits)} label={t('profile.card.memory')} t={t} />
    </div>
  );
}

function TotalsCard({ activity, t }: Parameters<ProfileCardDescriptor['render']>[0]): ReactElement {
  const events = sumCounts(activity?.events ?? []);
  const commits = sumCounts(activity?.memoryCommits ?? []);
  return (
    <div className="bh-profile-card-body">
      <dl className="bh-profile-stats">
        <div>
          <dt>{t('profile.stat.events')}</dt>
          <dd>{events}</dd>
        </div>
        <div>
          <dt>{t('profile.stat.memoryCommits')}</dt>
          <dd>{commits}</dd>
        </div>
      </dl>
    </div>
  );
}

function totalText(count: number, weeks: number, t: BotHarnessTranslate): string {
  return t('profile.window.total', { weeks, count });
}

/** Built-ins register through the shared registry; labels re-resolve on locale change. */
export function createProfileCardBuiltins(
  t: BotHarnessTranslate,
): readonly ProfileCardDescriptor[] {
  return [
    {
      id: 'event-activity',
      label: t('profile.card.events'),
      order: 10,
      render: (props) => <EventActivityCard {...props} />,
    },
    {
      id: 'memory-activity',
      label: t('profile.card.memory'),
      order: 20,
      render: (props) => <MemoryActivityCard {...props} />,
    },
    {
      id: 'totals',
      label: t('profile.card.totals'),
      order: 30,
      render: (props) => <TotalsCard {...props} />,
    },
  ];
}
