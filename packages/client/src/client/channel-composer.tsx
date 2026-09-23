import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
} from 'react';

import { Button, IconSendOutline16 } from '@deepseek-ai/dsh-client-ui-primitives';

import { PersonaBotFacepile, type PersonaBotFacepileItem } from './avatar.js';
import type { ChannelAttachmentRef } from './store.js';

/**
 * Activity projection consumed by the composer. It carries no Session payload
 * and owns no activity state; callers provide one accepted projection snapshot.
 */
export interface ChannelComposerActivity {
  items: readonly PersonaBotFacepileItem[];
  summary: string;
}

import { zhTranslate, type BotHarnessTranslate } from './locale.js';

export interface ChannelComposerUpload {
  id: string;
  file: File;
  status: 'uploading' | 'ready' | 'error';
  ref?: ChannelAttachmentRef;
  error?: string | undefined;
}

export interface ChannelComposerProps {
  value: string;
  placeholder: string;
  sending: boolean;
  /** Increment to focus the input after restoring a failed local message. */
  focusSignal?: number;
  attachments?: readonly ChannelComposerUpload[] | undefined;
  onAddFiles?(files: File[]): void;
  onRetryAttachment?(id: string): void;
  onRemoveAttachment?(id: string): void;
  activity?: ChannelComposerActivity | undefined;
  reply?: { id: string; author: string; body: string } | undefined;
  /** Locale-bound translate; falls back to Chinese when rendered in isolation. */
  t?: BotHarnessTranslate | undefined;
  onChange(value: string): void;
  onCancelReply?(): void;
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

export interface ComposerTextareaFit {
  expanded: boolean;
  height: number;
}

/** Keep the draft compact until content needs the bounded scrolling region. */
export function fitComposerTextarea(
  element: Pick<HTMLTextAreaElement, 'scrollHeight' | 'style'>,
  maxHeight = 144,
  singleLineHeight = 34,
): ComposerTextareaFit {
  element.style.height = '0px';
  const scrollHeight = element.scrollHeight;
  const height = Math.min(scrollHeight, maxHeight);
  element.style.height = `${height}px`;
  element.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
  return { expanded: scrollHeight > singleLineHeight, height };
}

function PersonaBotActivityStatus({
  activity,
  t,
}: {
  activity: ChannelComposerActivity | undefined;
  t: BotHarnessTranslate;
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
        t={t}
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
  focusSignal = 0,
  attachments = [],
  onAddFiles,
  onRetryAttachment,
  onRemoveAttachment,
  activity,
  reply,
  t = zhTranslate,
  onChange,
  onCancelReply,
  onSubmit,
}: ChannelComposerProps): ReactElement {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fit, setFit] = useState<ComposerTextareaFit & { animateFirstExpand: boolean }>({
    expanded: false,
    height: 34,
    animateFirstExpand: false,
  });
  const hasFooter = fit.expanded || reply !== undefined || attachments.length > 0;

  const syncTextarea = useCallback((element: HTMLTextAreaElement): void => {
    const nextFit = fitComposerTextarea(element);
    setFit((current) => {
      if (current.expanded === nextFit.expanded && current.height === nextFit.height) {
        return current;
      }
      return {
        ...nextFit,
        animateFirstExpand: !current.expanded && nextFit.expanded,
      };
    });
  }, []);

  useEffect(() => {
    if (inputRef.current === null) return;
    syncTextarea(inputRef.current);
  }, [syncTextarea, value]);

  const replyId = reply?.id;
  useEffect(() => {
    if (replyId !== undefined) inputRef.current?.focus();
  }, [replyId]);
  useEffect(() => {
    if (focusSignal > 0) inputRef.current?.focus();
  }, [focusSignal]);

  useEffect(() => {
    const element = inputRef.current;
    if (element === null || typeof ResizeObserver === 'undefined') return;

    let width = element.clientWidth;
    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = entry?.contentRect.width;
      if (nextWidth === undefined || nextWidth === width) return;
      width = nextWidth;
      syncTextarea(element);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [syncTextarea]);

  return (
    <div className="bh-composer-shell">
      <PersonaBotActivityStatus activity={activity} t={t} />
      <div
        className={`bh-composer ${fit.expanded ? 'bh-composer-expanded' : 'bh-composer-compact'}${fit.animateFirstExpand ? ' bh-composer-first-expand' : ''}${reply === undefined ? '' : ' bh-composer-replying'}${hasFooter ? ' bh-composer-with-footer' : ''}`}
        data-layout={fit.expanded ? 'expanded' : 'compact'}
        style={{ '--bh-composer-body-height': `${fit.height}px` } as CSSProperties}
      >
        {reply === undefined ? null : (
          <div className="bh-composer-reply">
            <div className="bh-composer-reply-copy">
              <span className="bh-composer-reply-author">
                {t('message.replyingTo', { author: reply.author })}
              </span>
              <span className="bh-composer-reply-body">{reply.body}</span>
            </div>
            <button
              type="button"
              className="bh-composer-reply-cancel"
              aria-label={t('message.replyCancel')}
              onClick={onCancelReply}
            >
              &times;
            </button>
          </div>
        )}
        {attachments.length > 0 ? (
          <div className="bh-composer-attachments" aria-live="polite">
            {attachments.map((item) => (
              <div className="bh-composer-attachment" key={item.id}>
                <span className="bh-composer-attachment-name" title={item.file.name}>
                  {item.file.name}
                </span>
                {item.status === 'uploading' ? <span>{t('composer.uploading')}</span> : null}
                {item.status === 'error' ? (
                  <button
                    type="button"
                    onClick={() => onRetryAttachment?.(item.id)}
                    title={item.error}
                  >
                    {t('composer.retryAttachment')}
                  </button>
                ) : null}
                <button
                  type="button"
                  aria-label={t('composer.removeAttachment', { name: item.file.name })}
                  onClick={() => onRemoveAttachment?.(item.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="bh-composer-body">
          <textarea
            ref={inputRef}
            className="bh-composer-input"
            rows={1}
            placeholder={placeholder}
            value={value}
            disabled={sending}
            onChange={(event) => {
              syncTextarea(event.currentTarget);
              onChange(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && reply !== undefined) {
                event.preventDefault();
                onCancelReply?.();
                return;
              }
              if (!shouldSubmitComposerKey(event)) return;
              event.preventDefault();
              void onSubmit();
            }}
          />
        </div>
        <input
          ref={fileInputRef}
          className="bh-composer-file-input"
          type="file"
          multiple
          aria-label={t('composer.addAttachment')}
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
            if (files.length > 0) onAddFiles?.(files);
          }}
        />
        <button
          type="button"
          className="bh-composer-add-file"
          aria-label={t('composer.addAttachment')}
          disabled={sending || attachments.length >= 10}
          onClick={() => fileInputRef.current?.click()}
        >
          +
        </button>
        <div className="bh-composer-footer">
          <Button
            className="bh-send-btn"
            variant="primary"
            size="sm"
            icon={<IconSendOutline16 size={16} />}
            aria-label={sending ? t('message.sending') : t('composer.send')}
            disabled={
              (value.trim().length === 0 && attachments.length === 0) ||
              sending ||
              attachments.some((item) => item.status !== 'ready')
            }
            onClick={() => void onSubmit()}
          />
        </div>
      </div>
    </div>
  );
}
