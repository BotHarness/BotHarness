import { useEffect, useMemo, useState, type ReactElement } from 'react';

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
  /** Stable PersonaBot identity; never use a mutable display name as the seed. */
  personaBotId: string;
  name: string;
  size: number;
  src?: string | undefined;
  state?: PersonaBotActivityState | undefined;
  effect?: PersonaBotActivityEffect | undefined;
  indicator?: boolean | undefined;
  /** Locale-bound translate for the activity label; Chinese when rendered in isolation. */
  t?: BotHarnessTranslate | undefined;
  className?: string | undefined;
}

export interface PersonaBotFacepileItem {
  personaBotId: string;
  name: string;
  src?: string | undefined;
  state?: PersonaBotActivityState | undefined;
  effect?: PersonaBotActivityEffect | undefined;
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

  useEffect(() => {
    setFailedSrc(undefined);
  }, [src]);

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

/**
 * The only PersonaBot avatar renderer used by BotHarness surfaces. Blobatar
 * motion and custom-image activity live behind this interface, so every
 * binding can render the same projected state without knowing media details.
 */
export function PersonaBotAvatar({
  personaBotId,
  name,
  size,
  src,
  state = 'idle',
  effect,
  indicator = true,
  className,
  t = zhTranslate,
}: PersonaBotAvatarProps): ReactElement {
  const resolvedEffect = effect ?? defaultActivityEffect(state);
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
      role="img"
      aria-label={`${name}：${personaBotActivityLabel(state, t)}`}
    >
      <AvatarMedia personaBotId={personaBotId} name={name} src={src} />
      {indicator ? <ActivityIndicator state={state} /> : null}
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

/** Compatibility wrapper for older call sites outside the bundled client. */
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
