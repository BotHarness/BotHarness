import type { ReactElement } from 'react';
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import {
  PersonaBotFacepile,
  personaBotPresentationSummary,
  type PersonaBotFacepileItem,
} from './avatar.js';
import type { BotHarnessTranslate } from './locale.js';
import type { ChannelSummary } from './store.js';
import { CompanionPin } from './window-companions-view.js';
import type { WindowCompanions } from './window-companions.js';

export function GroupChannelHeader({
  channel,
  title,
  members,
  expanded,
  t,
  onOpenActivity,
  onToggleProfile,
  companion,
}: {
  channel: ChannelSummary;
  title: string;
  members: readonly PersonaBotFacepileItem[];
  expanded: boolean;
  t: BotHarnessTranslate;
  onOpenActivity(): void;
  onToggleProfile(): void;
  companion?: WindowCompanions | undefined;
}): ReactElement {
  return (
    <span className="bh-channel-island bh-group-channel-header">
      {channel.avatar ? (
        <img className="bh-group-avatar-image bh-group-avatar-topbar" src={channel.avatar} alt="" />
      ) : members.length === 0 ? (
        <span className="bh-channel-mark bh-channel-mark-sm" aria-hidden="true">
          #
        </span>
      ) : null}
      <PersonaBotFacepile
        items={members}
        indicator={false}
        size={22}
        t={t}
        renderAvatar={(item, avatar) => {
          const label =
            item.name +
            ' · ' +
            personaBotPresentationSummary(item.state ?? 'idle', item.activity, item.attention, t);
          return (
            <span key={item.personaBotId} className="bh-companion-chip">
              <Tooltip label={label} side="bottom" portal delayMs={350}>
                <button
                  type="button"
                  className="bh-avatar-facepile-button"
                  aria-label={label}
                  aria-haspopup="dialog"
                  aria-expanded={expanded}
                  onClick={onOpenActivity}
                >
                  {avatar}
                </button>
              </Tooltip>
              {companion ? (
                <CompanionPin
                  companion={companion}
                  botId={item.personaBotId}
                  name={item.name}
                  t={t}
                />
              ) : null}
            </span>
          );
        }}
      />
      <button
        type="button"
        className="bh-group-channel-name"
        aria-haspopup="dialog"
        aria-expanded={expanded}
        aria-label={t('groupProfile.openAvatar', { name: channel.name })}
        onClick={onToggleProfile}
      >
        <span className="bh-title">{title}</span>
      </button>
    </span>
  );
}
