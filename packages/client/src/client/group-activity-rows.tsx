import type { ReactElement } from 'react';
import {
  PersonaBotAvatar,
  personaBotPresentationSummary,
  type PersonaBotFacepileItem,
} from './avatar.js';
import type { BotHarnessTranslate } from './locale.js';

export function GroupActivityRows({
  items,
  t,
}: {
  items: readonly PersonaBotFacepileItem[];
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <>
      {items.map((item) => {
        const latest = personaBotPresentationSummary(
          item.state ?? 'idle',
          item.activity,
          item.attention,
          t,
        );
        return (
          <li
            className="bh-composer-activity-session bh-composer-activity-bot"
            key={item.personaBotId}
            data-bot-id={item.personaBotId}
          >
            <PersonaBotAvatar {...item} size={20} t={t} />
            <span className="bh-composer-activity-source-label" title={item.name}>
              {item.name}
            </span>
            <span className="bh-composer-activity-session-latest" role="status" title={latest}>
              {latest}
            </span>
          </li>
        );
      })}
    </>
  );
}
