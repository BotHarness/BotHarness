import { useEffect, useRef, type KeyboardEvent, type ReactElement } from 'react';

import { Button, IconSendOutline16 } from '@deepseek-ai/dsh-client-ui-primitives';

import { PersonaBotFacepile, type PersonaBotFacepileItem } from './avatar.js';

/**
 * Activity projection consumed by the composer. It carries no Session payload
 * and owns no activity state; callers provide one accepted projection snapshot.
 */
export interface ChannelComposerActivity {
  items: readonly PersonaBotFacepileItem[];
  summary: string;
}

export interface ChannelComposerProps {
  value: string;
  placeholder: string;
  sending: boolean;
  activity?: ChannelComposerActivity | undefined;
  onChange(value: string): void;
  onSubmit(): void | Promise<void>;
}

/** Submit on plain Enter while preserving Shift+Enter and IME composition. */
export function shouldSubmitComposerKey(
  event: Pick<KeyboardEvent<HTMLTextAreaElement>, 'key' | 'shiftKey' | 'nativeEvent'>,
): boolean {
  return (
    event.key === 'Enter' &&
    !event.shiftKey &&
    !event.nativeEvent.isComposing &&
    event.nativeEvent.keyCode !== 229
  );
}

/** Keep the draft compact until content needs the bounded scrolling region. */
export function fitComposerTextarea(
  element: Pick<HTMLTextAreaElement, 'scrollHeight' | 'style'>,
  maxHeight = 144,
): void {
  element.style.height = '0px';
  const height = Math.min(element.scrollHeight, maxHeight);
  element.style.height = `${height}px`;
  element.style.overflowY = element.scrollHeight > maxHeight ? 'auto' : 'hidden';
}

function PersonaBotActivityStatus({
  activity,
}: {
  activity: ChannelComposerActivity | undefined;
}): ReactElement | null {
  if (activity === undefined || activity.items.length === 0) return null;

  return (
    <div
      className="bh-composer-activity-status"
      role="status"
      aria-live="polite"
      title={activity.summary}
    >
      <PersonaBotFacepile
        className="bh-composer-activity-facepile"
        items={activity.items}
        size={40}
      />
      <span className="bh-composer-activity-summary">{activity.summary}</span>
    </div>
  );
}

/**
 * DSH-native channel composer island. Draft and send authority remain with the
 * owning conversation; this component only renders and forwards interaction.
 */
export function ChannelComposer({
  value,
  placeholder,
  sending,
  activity,
  onChange,
  onSubmit,
}: ChannelComposerProps): ReactElement {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (inputRef.current !== null) fitComposerTextarea(inputRef.current);
  }, [value]);

  return (
    <div className="bh-composer-shell">
      <PersonaBotActivityStatus activity={activity} />
      <div className="bh-composer">
        <div className="bh-composer-controls">
          <textarea
            ref={inputRef}
            className="bh-composer-input"
            rows={1}
            placeholder={placeholder}
            value={value}
            disabled={sending}
            onChange={(event) => {
              onChange(event.target.value);
            }}
            onKeyDown={(event) => {
              if (!shouldSubmitComposerKey(event)) return;
              event.preventDefault();
              void onSubmit();
            }}
          />
          <Button
            className="bh-send-btn"
            variant="primary"
            size="sm"
            icon={<IconSendOutline16 size={16} />}
            aria-label="发送"
            disabled={value.trim().length === 0 || sending}
            onClick={() => void onSubmit()}
          >
            <span className="bh-send-label">{sending ? '发送中' : '发送'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
