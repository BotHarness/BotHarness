import type { ReactElement } from 'react';
import { PersonaBotAvatar } from './avatar.js';
import { HashIcon } from './hash-icon.js';
import type { BotHarnessTranslate } from './locale.js';
import type { BotSummary, ChannelSummary } from './store.js';

const MAX_STACKED_FACES = 4;
const FACE_SCALE = [0.64, 0.6, 0.43] as const;

export function groupAvatarStackBots(
  members: readonly string[],
  bots: ReadonlyMap<string, BotSummary>,
): BotSummary[] {
  const faces: BotSummary[] = [];
  for (const slug of members) {
    const bot = bots.get(slug);
    if (bot !== undefined) faces.push(bot);
    if (faces.length === MAX_STACKED_FACES) break;
  }
  return faces;
}

export function GroupChannelIcon({
  channel,
  bots,
  className,
  groupClassName,
  size,
  hashSize,
  t,
}: {
  channel: ChannelSummary;
  bots: ReadonlyMap<string, BotSummary>;
  className: string;
  groupClassName: string;
  size: number;
  hashSize: number;
  t: BotHarnessTranslate;
}): ReactElement {
  const faces = channel.avatar ? [] : groupAvatarStackBots(channel.members, bots);
  const tile = channel.avatar !== undefined || faces.length > 0;
  return (
    <span className={tile ? `${className} ${groupClassName}` : className} aria-hidden="true">
      {channel.avatar ? (
        <img className="bh-group-avatar-image" src={channel.avatar} alt="" />
      ) : faces.length === 0 ? (
        <HashIcon size={hashSize} />
      ) : (
        <span className="bh-group-avatar-stack" data-count={faces.length}>
          {faces.map((bot) => (
            <PersonaBotAvatar
              key={bot.slug}
              t={t}
              personaBotId={bot.slug}
              name={bot.displayName}
              src={bot.avatar}
              appearance={bot.appearance}
              avatarSeed={bot.avatarSeed}
              size={Math.round(size * FACE_SCALE[Math.min(faces.length, 3) - 1]!)}
              indicator={false}
              still
            />
          ))}
        </span>
      )}
    </span>
  );
}
