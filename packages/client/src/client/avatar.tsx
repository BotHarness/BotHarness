import { useMemo, useState, type ReactElement } from 'react';

import type {
  PersonaBotAttention,
  PersonaBotSessionActivity,
} from '../../../core/src/state/bot-state.js';
import type { PersonaBotToolActivity } from '../../../core/src/state/tool-activity.js';

import { blobatar } from 'blobatar';

import { zhTranslate, type BotHarnessTranslate } from './locale.js';

export const PERSONA_BOT_ACTIVITY_STATES = [
  'idle',
  'thinking',
  'working',
  'waiting',
  'blocked',
] as const;

export type PersonaBotActivityState = (typeof PERSONA_BOT_ACTIVITY_STATES)[number];

export type PersonaBotActivityEffect =
  | 'thinking-dots'
  | 'searching'
  | 'coding'
  | 'executing'
  | 'generic-working';

export interface PersonaBotAvatarProps {
  personaBotId: string;
  name: string;
  size: number;
  src?: string | undefined;
  state?: PersonaBotActivityState | undefined;
  effect?: PersonaBotActivityEffect | undefined;
  activity?: PersonaBotToolActivity | undefined;
  attention?: PersonaBotAttention | undefined;
  indicator?: boolean | undefined;
  t?: BotHarnessTranslate | undefined;
  className?: string | undefined;
}

export interface PersonaBotFacepileItem {
  sessions?: readonly PersonaBotSessionActivity[] | undefined;
  personaBotId: string;
  name: string;
  src?: string | undefined;
  state?: PersonaBotActivityState | undefined;
  effect?: PersonaBotActivityEffect | undefined;
  activity?: PersonaBotToolActivity | undefined;
  attention?: PersonaBotAttention | undefined;
}

const FALLBACK_HUES = [225, 262, 12, 152, 47, 200];

function fallbackMarkup(seed: string): string {
  const hue = FALLBACK_HUES[seed.length % FALLBACK_HUES.length] ?? 225;
  const initial = seed.slice(0, 1).toUpperCase();
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="46" fill="hsl(${hue} 70% 62%)"/><text x="50" y="62" text-anchor="middle" font-size="42" fill="white">${initial}</text></svg>`;
}

export function normalizePersonaBotActivity(value: unknown): PersonaBotActivityState {
  return PERSONA_BOT_ACTIVITY_STATES.includes(value as PersonaBotActivityState)
    ? (value as PersonaBotActivityState)
    : 'idle';
}

export function defaultActivityEffect(
  state: PersonaBotActivityState,
): PersonaBotActivityEffect | undefined {
  if (state === 'thinking') return 'thinking-dots';
  if (state === 'working') return 'generic-working';
  return undefined;
}

export function personaBotActivityLabel(
  state: PersonaBotActivityState,
  t: BotHarnessTranslate = zhTranslate,
): string {
  switch (state) {
    case 'idle':
      return t('activity.idle');
    case 'thinking':
      return t('activity.thinking');
    case 'working':
      return t('activity.working');
    case 'waiting':
      return t('activity.waiting');
    case 'blocked':
      return t('activity.blocked');
  }
}

export function personaBotActivitySources(
  activity: PersonaBotToolActivity | undefined,
  t: BotHarnessTranslate = zhTranslate,
): string | undefined {
  return activity?.sources
    ?.map(({ role, count }) => {
      const label = t(`activity.source.${role}`);
      return count > 1 ? t('activity.sourceCount', { label, count }) : label;
    })
    .join(' / ');
}

export function personaBotActivitySummary(
  state: PersonaBotActivityState,
  activity: PersonaBotToolActivity | undefined,
  t: BotHarnessTranslate = zhTranslate,
): string {
  if (state !== 'working' || activity === undefined) return personaBotActivityLabel(state, t);
  const label =
    activity.effect === 'searching'
      ? t('activity.searching')
      : activity.effect === 'coding'
        ? t('activity.coding')
        : activity.effect === 'executing'
          ? t('activity.executing')
          : t('activity.working');
  return [
    label,
    activity.toolName,
    activity.publicDetail,
    personaBotActivitySources(activity, t),
    activity.activeToolCount > 1
      ? t('activity.toolCount', { count: activity.activeToolCount })
      : undefined,
  ]
    .filter((value) => value !== undefined)
    .join(' · ');
}

export function personaBotPresentationSummary(
  state: PersonaBotActivityState,
  activity: PersonaBotToolActivity | undefined,
  attention: PersonaBotAttention | undefined,
  t: BotHarnessTranslate = zhTranslate,
): string {
  return [
    personaBotActivitySummary(state, activity, t),
    attention === undefined
      ? undefined
      : t('activity.approvalCount', { count: attention.approvalCount }),
  ]
    .filter(Boolean)
    .join(' · ');
}

function BlobatarMedia({ seed }: { seed: string }): ReactElement {
  const markup = useMemo(() => {
    try {
      return blobatar(`botharness:${seed}`);
    } catch {
      return fallbackMarkup(seed);
    }
  }, [seed]);

  return <span className="bh-avatar-media" dangerouslySetInnerHTML={{ __html: markup }} />;
}

function AvatarMedia({
  personaBotId,
  name,
  src,
}: {
  personaBotId: string;
  name: string;
  src?: string | undefined;
}): ReactElement {
  const [failedSrc, setFailedSrc] = useState<string | undefined>(undefined);

  if (src !== undefined && src.length > 0 && failedSrc !== src) {
    return (
      <span className="bh-avatar-media bh-avatar-media-image">
        <img
          src={src}
          alt=""
          draggable={false}
          onError={() => {
            setFailedSrc(src);
          }}
        />
      </span>
    );
  }

  return <BlobatarMedia seed={personaBotId || name} />;
}

function ActivityIndicator({ state }: { state: PersonaBotActivityState }): ReactElement | null {
  if (state === 'idle') return null;
  if (state === 'thinking') {
    return (
      <span className="bh-avatar-indicator bh-avatar-thinking" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    );
  }
  return <span className="bh-avatar-indicator" aria-hidden="true" />;
}

export function PersonaBotAvatar({
  personaBotId,
  name,
  size,
  src,
  state = 'idle',
  effect,
  activity,
  attention,
  indicator = true,
  className,
  t = zhTranslate,
}: PersonaBotAvatarProps): ReactElement {
  const resolvedEffect =
    effect ?? (state === 'working' ? activity?.effect : undefined) ?? defaultActivityEffect(state);
  const summary = personaBotPresentationSummary(state, activity, attention, t);
  const mediaKind = src === undefined || src.length === 0 ? 'blob' : 'image';
  const active = state === 'thinking' || state === 'working';
  const classes = ['bh-persona-avatar', className].filter(Boolean).join(' ');

  return (
    <span
      className={classes}
      style={{ width: size, height: size }}
      data-state={state}
      data-effect={resolvedEffect}
      data-media={mediaKind}
      data-active={active ? 'true' : 'false'}
      title={`${name} · ${summary}`}
      role="img"
      aria-label={t('avatar.label', { name, activity: summary })}
    >
      <AvatarMedia key={src ?? ''} personaBotId={personaBotId} name={name} src={src} />
      {indicator ? <ActivityIndicator state={state} /> : null}
      {indicator && attention !== undefined ? (
        <span
          className="bh-avatar-attention"
          data-approval-count={attention.approvalCount}
          aria-hidden="true"
        >
          {attention.approvalCount > 99 ? '99+' : attention.approvalCount}
        </span>
      ) : null}
    </span>
  );
}

export function PersonaBotFacepile({
  items,
  size,
  max = 3,
  className,
  t = zhTranslate,
}: {
  items: readonly PersonaBotFacepileItem[];
  size: number;
  max?: number | undefined;
  className?: string | undefined;
  t?: BotHarnessTranslate | undefined;
}): ReactElement | null {
  if (items.length === 0) return null;
  const visible = items.slice(0, max);
  const overflow = items.length - visible.length;
  return (
    <span className={['bh-avatar-facepile', className].filter(Boolean).join(' ')}>
      {visible.map((item) => (
        <PersonaBotAvatar key={item.personaBotId} {...item} size={size} t={t} />
      ))}
      {overflow > 0 ? (
        <span className="bh-avatar-facepile-overflow" style={{ width: size, height: size }}>
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}

export function Blobatar({ seed, size }: { seed: string; size: number }): ReactElement {
  return (
    <PersonaBotAvatar
      personaBotId={seed}
      name={seed}
      size={size}
      indicator={false}
      t={zhTranslate}
    />
  );
}
