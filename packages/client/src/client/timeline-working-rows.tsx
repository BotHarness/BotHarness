import type { ReactElement } from 'react';
import {
  PersonaBotAvatar,
  personaBotActivitySummary,
  type PersonaBotFacepileItem,
} from './avatar.js';
import { attentionCount } from './activity-attention.js';
import type { ChannelComposerActivity } from './channel-composer.js';
import type { BotHarnessTranslate } from './locale.js';

const MAX_WORKING_ROWS = 2;

export interface TimelineWorkingRows {
  items: readonly PersonaBotFacepileItem[];
  more: number;
}

export function timelineWorkingRows(
  activity: ChannelComposerActivity | undefined,
  streamingBotSlugs: ReadonlySet<string>,
): TimelineWorkingRows {
  const active = (activity?.items ?? []).filter(
    (item) =>
      (item.state === 'thinking' || item.state === 'working') &&
      attentionCount(item.attention) === 0 &&
      !streamingBotSlugs.has(item.personaBotId),
  );
  return {
    items: active.slice(0, MAX_WORKING_ROWS),
    more: Math.max(0, active.length - MAX_WORKING_ROWS),
  };
}

function rowActivity(
  activity: PersonaBotFacepileItem['activity'],
): PersonaBotFacepileItem['activity'] {
  if (activity === undefined) return undefined;
  const { sources: _sources, ...rest } = activity;
  return { ...rest, activeToolCount: 1 };
}

export function TimelineWorkingRowsView({
  rows,
  t,
}: {
  rows: TimelineWorkingRows;
  t: BotHarnessTranslate;
}): ReactElement | null {
  if (rows.items.length === 0) return null;
  return (
    <div className="bh-timeline-working" aria-hidden="true">
      {rows.items.map((item) => (
        <div
          key={item.personaBotId}
          className="bh-timeline-working-row"
          data-bot-slug={item.personaBotId}
        >
          <span className="bh-message-group-avatar">
            <PersonaBotAvatar
              t={t}
              personaBotId={item.personaBotId}
              name={item.name}
              src={item.src}
              appearance={item.appearance}
              avatarSeed={item.avatarSeed}
              state={item.state}
              activity={item.activity}
              size={28}
              indicator={false}
            />
          </span>
          <span className="bh-timeline-working-summary">
            <span className="bh-timeline-working-name">{item.name}</span>
            {' · '}
            {personaBotActivitySummary(item.state ?? 'idle', rowActivity(item.activity), t)}
            <span className="bh-timeline-working-ellipsis">
              <i>.</i>
              <i>.</i>
              <i>.</i>
            </span>
          </span>
        </div>
      ))}
      {rows.more > 0 ? (
        <div className="bh-timeline-working-more">
          {t('main.activity.more', { count: rows.more })}
        </div>
      ) : null}
    </div>
  );
}
