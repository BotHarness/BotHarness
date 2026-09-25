import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
} from 'react';

import { Button, IconSendOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { createPortal } from 'react-dom';

import { PersonaBotAvatar, PersonaBotFacepile, type PersonaBotFacepileItem } from './avatar.js';
import {
  activeMentionQuery,
  deleteSelectedMention,
  rebaseMentions,
  selectMention,
  type MentionQuery,
  type SelectedMention,
} from './mentions.js';
import {
  insertRichPlainText,
  readRichMentionDraft,
  renderRichMentionDraft,
  richSelectionOffsets,
  sameRichMentionDraft,
  setRichSelection,
  type MentionAvatarMount,
} from './rich-mention-editor.js';
import type { BotSummary } from './store.js';
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
const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

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
  mentionCandidates?: readonly BotSummary[] | undefined;
  mentions?: readonly SelectedMention[] | undefined;
  reply?: { id: string; author: string; body: string } | undefined;
  /** Locale-bound translate; falls back to Chinese when rendered in isolation. */
  t?: BotHarnessTranslate | undefined;
  onChange(value: string, mentions?: SelectedMention[]): void;
  onCancelReply?(): void;
  onSubmit(): void | Promise<void>;
}

/** Submit on plain Enter while preserving Shift+Enter and IME composition. */
export function shouldSubmitComposerKey(
  event: Pick<KeyboardEvent<HTMLElement>, 'key' | 'shiftKey' | 'nativeEvent'>,
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
  element: Pick<HTMLElement, 'scrollHeight' | 'style'>,
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
  mentionCandidates = [],
  mentions = [],
  reply,
  t = zhTranslate,
  onChange,
  onCancelReply,
  onSubmit,
}: ChannelComposerProps): ReactElement {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const richRef = useRef<HTMLDivElement | null>(null);
  const requestedCaret = useRef<number | undefined>(undefined);
  const renderedAvatarKey = useRef('');
  const [avatarMounts, setAvatarMounts] = useState<MentionAvatarMount[]>([]);
  const rich = mentionCandidates.length > 0 || mentions.length > 0;
  const [mentionQuery, setMentionQuery] = useState<MentionQuery | undefined>();
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const candidates =
    mentionQuery === undefined
      ? []
      : mentionCandidates
          .filter(
            (bot) =>
              !bot.paused &&
              (bot.displayName
                .toLocaleLowerCase()
                .includes(mentionQuery.query.toLocaleLowerCase()) ||
                bot.slug.toLocaleLowerCase().includes(mentionQuery.query.toLocaleLowerCase())),
          )
          .slice(0, 8);
  const chooseMention = (bot: BotSummary): void => {
    if (mentionQuery === undefined) return;
    const selected = selectMention(value, mentions, mentionQuery, bot.slug, bot.displayName);
    onChange(selected.value, selected.mentions);
    setMentionQuery(undefined);
    requestedCaret.current = selected.caret;
    requestAnimationFrame(() => {
      const editor = richRef.current;
      if (editor !== null) {
        editor.focus();
        setRichSelection(editor, selected.caret);
      } else {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(selected.caret, selected.caret);
      }
    });
  };
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fit, setFit] = useState<ComposerTextareaFit & { animateFirstExpand: boolean }>({
    expanded: false,
    height: 34,
    animateFirstExpand: false,
  });
  const hasFooter = fit.expanded || reply !== undefined || attachments.length > 0;

  const syncTextarea = useCallback((element: HTMLElement): void => {
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

  const avatarKey = mentions
    .map((mention) => {
      const bot = mentionCandidates.find((candidate) => candidate.slug === mention.botSlug);
      return [mention.botSlug, bot?.displayName, bot?.avatar].join(':');
    })
    .join('|');
  useClientLayoutEffect(() => {
    const editor = richRef.current;
    if (editor === null) {
      if (!rich) setAvatarMounts([]);
      return;
    }
    const current = readRichMentionDraft(editor);
    if (sameRichMentionDraft(current, value, mentions) && renderedAvatarKey.current === avatarKey)
      return;
    const caret =
      requestedCaret.current ??
      (editor.ownerDocument.activeElement === editor
        ? richSelectionOffsets(editor)?.end
        : undefined);
    const mounts = renderRichMentionDraft(editor, value, mentions, mentionCandidates);
    setAvatarMounts(mounts);
    renderedAvatarKey.current = avatarKey;
    requestedCaret.current = undefined;
    if (caret !== undefined) setRichSelection(editor, Math.min(caret, value.length));
    syncTextarea(editor);
  }, [rich, value, mentions, mentionCandidates, avatarKey, syncTextarea]);

  useEffect(() => {
    const element = richRef.current ?? textareaRef.current;
    if (element !== null) syncTextarea(element);
  }, [syncTextarea, value, mentions, rich]);

  const replyId = reply?.id;
  useEffect(() => {
    if (replyId !== undefined) (richRef.current ?? textareaRef.current)?.focus();
  }, [replyId]);
  useEffect(() => {
    if (focusSignal > 0) (richRef.current ?? textareaRef.current)?.focus();
  }, [focusSignal]);

  useEffect(() => {
    const element = richRef.current ?? textareaRef.current;
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
  }, [syncTextarea, rich]);

  const emitRichChange = (editor: HTMLDivElement): void => {
    if (editor.innerHTML === '<br>') editor.replaceChildren();
    const next = readRichMentionDraft(editor);
    syncTextarea(editor);
    onChange(next.value, next.mentions);
    setMentionQuery(
      activeMentionQuery(
        next.value,
        richSelectionOffsets(editor)?.end ?? next.value.length,
        next.mentions,
      ),
    );
    setActiveMentionIndex(0);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    const input = event.currentTarget;
    const selection =
      input instanceof HTMLTextAreaElement
        ? { start: input.selectionStart, end: input.selectionEnd }
        : richSelectionOffsets(input);
    if (
      (event.key === 'Backspace' || event.key === 'Delete') &&
      !event.nativeEvent.isComposing &&
      selection !== undefined
    ) {
      const deleted = deleteSelectedMention(
        value,
        mentions,
        selection.start,
        selection.end,
        event.key,
      );
      if (deleted !== undefined) {
        event.preventDefault();
        requestedCaret.current = deleted.caret;
        onChange(deleted.value, deleted.mentions);
        setMentionQuery(undefined);
        if (input instanceof HTMLTextAreaElement)
          requestAnimationFrame(() => input.setSelectionRange(deleted.caret, deleted.caret));
        return;
      }
    }
    if (mentionQuery !== undefined && candidates.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveMentionIndex(
          (index) =>
            (index + (event.key === 'ArrowDown' ? 1 : -1) + candidates.length) % candidates.length,
        );
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        chooseMention(candidates[activeMentionIndex] ?? candidates[0]!);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setMentionQuery(undefined);
        return;
      }
    }
    if (event.key === 'Escape' && reply !== undefined) {
      event.preventDefault();
      onCancelReply?.();
      return;
    }
    if (
      input instanceof HTMLDivElement &&
      event.key === 'Enter' &&
      event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      insertRichPlainText(input, '\n');
      emitRichChange(input);
      return;
    }
    if (!shouldSubmitComposerKey(event)) return;
    event.preventDefault();
    void onSubmit();
  };

  return (
    <div className="bh-composer-shell">
      {mentionQuery !== undefined && candidates.length > 0 ? (
        <div className="bh-mention-picker" role="listbox" aria-label="Mention a PersonaBot">
          {candidates.map((candidate, index) => (
            <button
              key={candidate.slug}
              type="button"
              className={`bh-mention-option${index === activeMentionIndex ? ' bh-mention-option-active' : ''}`}
              role="option"
              aria-selected={index === activeMentionIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => chooseMention(candidate)}
            >
              <PersonaBotAvatar
                personaBotId={candidate.slug}
                name={candidate.displayName}
                src={candidate.avatar}
                size={28}
                indicator={false}
                t={t}
              />
              <span className="bh-mention-option-copy">
                <strong>{candidate.displayName}</strong>
                <small>{candidate.roles.join(' · ') || candidate.slug}</small>
              </span>
              <small className="bh-mention-option-id">{candidate.slug}</small>
            </button>
          ))}
        </div>
      ) : null}
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
          {rich ? (
            <div
              ref={richRef}
              className="bh-composer-input bh-composer-rich-input"
              role="textbox"
              aria-label={placeholder}
              aria-multiline="true"
              aria-disabled={sending}
              data-placeholder={placeholder}
              contentEditable={!sending}
              suppressContentEditableWarning
              onInput={(event) => emitRichChange(event.currentTarget)}
              onPaste={(event) => {
                event.preventDefault();
                insertRichPlainText(
                  event.currentTarget,
                  event.clipboardData.getData('text/plain').replace(/\r\n?/gu, '\n'),
                );
                emitRichChange(event.currentTarget);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const text = event.dataTransfer.getData('text/plain');
                if (text.length > 0) {
                  insertRichPlainText(event.currentTarget, text.replace(/\r\n?/gu, '\n'));
                  emitRichChange(event.currentTarget);
                }
              }}
              onKeyDown={handleKeyDown}
            />
          ) : (
            <textarea
              ref={textareaRef}
              className="bh-composer-input"
              rows={1}
              placeholder={placeholder}
              value={value}
              disabled={sending}
              onChange={(event) => {
                syncTextarea(event.currentTarget);
                const next = event.target.value;
                const nextMentions = rebaseMentions(value, next, mentions);
                onChange(next, nextMentions);
                setMentionQuery(
                  activeMentionQuery(next, event.currentTarget.selectionStart, nextMentions),
                );
                setActiveMentionIndex(0);
              }}
              onKeyDown={handleKeyDown}
            />
          )}
        </div>
        {avatarMounts.map((mount, index) =>
          createPortal(
            <PersonaBotAvatar
              personaBotId={mount.botSlug}
              name={mount.name}
              src={mount.src}
              size={16}
              indicator={false}
              t={t}
            />,
            mount.target,
            `${mount.botSlug}-${index}`,
          ),
        )}
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
            icon={<IconSendOutlineRegular size={16} />}
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
