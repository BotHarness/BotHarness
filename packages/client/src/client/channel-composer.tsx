import {
  useCallback,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
} from 'react';

import {
  Button,
  FileTypeIcon,
  IconCloseOutlineRegular,
  IconChevronDownOutlineRegular,
  IconPaperclipOutlineRegular,
  IconSendOutlineRegular,
  ImageLightbox,
} from '@deepseek-ai/dsh-client-ui-primitives';
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
import type { BotSummary, ChannelSummary } from './store.js';
import {
  activeChannelRefQuery,
  deleteSelectedChannelRef,
  rebaseChannelRefs,
  selectChannelRef,
  type ChannelRefQuery,
  type SelectedChannelRef,
} from './channel-refs.js';
import type { ChannelAttachmentRef } from './store.js';

export interface ChannelComposerActivity {
  items: readonly PersonaBotFacepileItem[];
  summary: string;
}

import { zhTranslate, type BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { SessionRoleIcon } from './session-role-icon.js';

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
  focusSignal?: number;
  attachments?: readonly ChannelComposerUpload[] | undefined;
  onAddFiles?(files: File[]): void;
  onRetryAttachment?(id: string): void;
  onRemoveAttachment?(id: string): void;
  activity?: ChannelComposerActivity | undefined;
  mentionCandidates?: readonly BotSummary[] | undefined;
  mentions?: readonly SelectedMention[] | undefined;
  channelCandidates?: readonly ChannelSummary[] | undefined;
  channelRefs?: readonly SelectedChannelRef[] | undefined;
  reply?: { id: string; author: string; body: string } | undefined;
  t?: BotHarnessTranslate | undefined;
  onChange(value: string, mentions?: SelectedMention[], channelRefs?: SelectedChannelRef[]): void;
  onCancelReply?(): void;
  onSubmit(): void | Promise<void>;
}

const IMAGE_ATTACHMENT_EXTENSION = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/iu;

function isImageAttachment(file: File): boolean {
  return (
    file.type.toLocaleLowerCase().startsWith('image/') || IMAGE_ATTACHMENT_EXTENSION.test(file.name)
  );
}

function AttachmentUploadStatus({
  item,
  t,
  onRetry,
}: {
  item: ChannelComposerUpload;
  t: BotHarnessTranslate;
  onRetry: () => void;
}): ReactElement | null {
  if (item.status === 'uploading') {
    return <span className="bh-composer-upload-status">{t('composer.uploading')}</span>;
  }
  if (item.status !== 'error') return null;
  return (
    <button type="button" className="bh-composer-upload-retry" onClick={onRetry} title={item.error}>
      {t('composer.retryAttachment')}
    </button>
  );
}

function ComposerImageAttachment({
  item,
  t,
  onRetry,
  onRemove,
}: {
  item: ChannelComposerUpload;
  t: BotHarnessTranslate;
  onRetry: () => void;
  onRemove: () => void;
}): ReactElement {
  const [source, setSource] = useState<string>();
  const [previewOpen, setPreviewOpen] = useState(false);
  const sourceMount = useMountedResource<HTMLDivElement>(() => {
    if (typeof URL.createObjectURL !== 'function') return;
    const nextSource = URL.createObjectURL(item.file);
    setSource(nextSource);
    return () => URL.revokeObjectURL(nextSource);
  }, [item.file]);
  const previewLabel = t('composer.previewAttachment', { name: item.file.name });

  return (
    <>
      <div
        ref={sourceMount}
        className="bh-composer-image-attachment"
        data-status={item.status}
        aria-busy={item.status === 'uploading'}
      >
        <button
          type="button"
          className="bh-composer-image-preview"
          aria-label={previewLabel}
          aria-haspopup="dialog"
          disabled={source === undefined}
          onClick={() => setPreviewOpen(true)}
        >
          {source === undefined ? null : (
            <img src={source} alt={item.file.name} draggable={false} />
          )}
        </button>
        <div className="bh-composer-image-status">
          <AttachmentUploadStatus item={item} t={t} onRetry={onRetry} />
        </div>
        <button
          type="button"
          className="bh-composer-attachment-remove bh-composer-image-remove"
          aria-label={t('composer.removeAttachment', { name: item.file.name })}
          onClick={onRemove}
        >
          <IconCloseOutlineRegular size={14} />
        </button>
      </div>
      {previewOpen && source !== undefined ? (
        <ImageLightbox
          src={source}
          alt={item.file.name}
          labels={{ dialog: previewLabel, close: t('common.close') }}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}
    </>
  );
}

function ComposerFileAttachment({
  item,
  t,
  onRetry,
  onRemove,
}: {
  item: ChannelComposerUpload;
  t: BotHarnessTranslate;
  onRetry: () => void;
  onRemove: () => void;
}): ReactElement {
  return (
    <div
      className="bh-composer-file-attachment"
      data-status={item.status}
      aria-busy={item.status === 'uploading'}
    >
      <span className="bh-composer-file-icon" aria-hidden="true">
        <FileTypeIcon path={item.file.name} size={28} />
      </span>
      <span className="bh-composer-file-copy">
        <span className="bh-composer-attachment-name" title={item.file.name}>
          {item.file.name}
        </span>
        <AttachmentUploadStatus item={item} t={t} onRetry={onRetry} />
      </span>
      <button
        type="button"
        className="bh-composer-attachment-remove"
        aria-label={t('composer.removeAttachment', { name: item.file.name })}
        onClick={onRemove}
      >
        <IconCloseOutlineRegular size={14} />
      </button>
    </div>
  );
}

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

function compactComposerScrollHeight(element: HTMLElement, currentHeight: number): number {
  const composer = element.closest<HTMLElement>('.bh-composer');
  if (!composer?.classList.contains('bh-composer-with-footer')) return currentHeight;
  const style = getComputedStyle(composer);
  const left = Number.parseFloat(style.getPropertyValue('--bh-composer-compact-padding-left'));
  const right = Number.parseFloat(style.getPropertyValue('--bh-composer-compact-padding-right'));
  const compactWidth = composer.clientWidth - left - right;
  if (!Number.isFinite(compactWidth) || compactWidth <= 0) return currentHeight;

  const mirror = element.cloneNode(true) as HTMLElement;
  if (element instanceof HTMLTextAreaElement && mirror instanceof HTMLTextAreaElement)
    mirror.value = element.value;
  mirror.setAttribute('aria-hidden', 'true');
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.width = compactWidth + 'px';
  mirror.style.height = '0px';
  mirror.style.minHeight = '0px';
  mirror.style.maxHeight = 'none';
  mirror.style.overflow = 'hidden';
  mirror.style.transition = 'none';
  composer.append(mirror);
  const compactHeight = mirror.scrollHeight;
  mirror.remove();
  return compactHeight;
}

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
  const compactHeight =
    scrollHeight <= singleLineHeight &&
    typeof HTMLElement !== 'undefined' &&
    element instanceof HTMLElement
      ? compactComposerScrollHeight(element, scrollHeight)
      : scrollHeight;
  return { expanded: compactHeight > singleLineHeight, height };
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
    <details className="bh-composer-activity-status">
      <summary className="bh-composer-activity-toggle">
        <PersonaBotFacepile
          t={t}
          className="bh-composer-activity-facepile"
          items={activity.items}
          size={28}
        />
        <span className="bh-composer-activity-summary" role="status" aria-live="polite">
          {activity.summary}
        </span>
        <IconChevronDownOutlineRegular className="bh-composer-activity-chevron" size={14} />
      </summary>
      <div className="bh-composer-activity-details">
        {activity.items.map((item) => (
          <div className="bh-composer-activity-bot" key={item.personaBotId}>
            <div className="bh-composer-activity-bot-header">
              <strong>{item.name}</strong>
              <span>
                {item.activity === undefined
                  ? t('activity.noToolDetail')
                  : t('activity.toolDetail', {
                      name: item.activity.toolName ?? t('activity.unknownTool'),
                      count: item.activity.activeToolCount,
                    })}
              </span>
            </div>
            {item.activity?.publicDetail !== undefined && (
              <span className="bh-composer-activity-public-detail">
                {item.activity.publicDetail}
              </span>
            )}
            {item.activity?.sources !== undefined && (
              <ul className="bh-composer-activity-sources">
                {item.activity.sources.map((source) => {
                  const label = t(`activity.source.${source.role}`);
                  return (
                    <li className="bh-composer-activity-source" key={source.role}>
                      <SessionRoleIcon role={source.role} label={label} />
                      <span className="bh-composer-activity-source-label">{label}</span>
                      <span className="bh-composer-activity-source-count">
                        {t('activity.sessionCount', { count: source.count })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

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
  channelCandidates = [],
  channelRefs = [],
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
  const rich =
    mentionCandidates.length > 0 ||
    mentions.length > 0 ||
    channelCandidates.length > 0 ||
    channelRefs.length > 0;
  const [mentionQuery, setMentionQuery] = useState<MentionQuery | undefined>();
  const [channelQuery, setChannelQuery] = useState<ChannelRefQuery | undefined>();
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
  const channelOptions =
    channelQuery === undefined
      ? []
      : channelCandidates
          .filter((channel) =>
            channel.name.toLocaleLowerCase().includes(channelQuery.query.toLocaleLowerCase()),
          )
          .slice(0, 8);
  const chooseChannel = (channel: ChannelSummary): void => {
    if (channelQuery === undefined) return;
    const selected = selectChannelRef(value, channelRefs, channelQuery, channel.id, channel.name);
    onChange(selected.value, rebaseMentions(value, selected.value, mentions), selected.refs);
    setChannelQuery(undefined);
    requestedCaret.current = selected.caret;
    requestAnimationFrame(() => {
      const editor = richRef.current;
      if (editor !== null) {
        editor.focus();
        setRichSelection(editor, selected.caret);
      }
    });
  };
  const chooseMention = (bot: BotSummary): void => {
    if (mentionQuery === undefined) return;
    const selected = selectMention(value, mentions, mentionQuery, bot.slug, bot.displayName);
    onChange(
      selected.value,
      selected.mentions,
      rebaseChannelRefs(value, selected.value, channelRefs),
    );
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
  const handleFilePaste = (event: ClipboardEvent<HTMLElement>): boolean => {
    const clipboard = event.clipboardData;
    const files = Array.from(clipboard.files);
    if (files.length === 0) {
      for (const item of Array.from(clipboard.items)) {
        if (item.kind !== 'file') continue;
        const file = item.getAsFile();
        if (file !== null) files.push(file);
      }
    }
    if (files.length === 0 || onAddFiles === undefined) return false;
    event.preventDefault();
    onAddFiles(files);
    return true;
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
  const richMount = useMountedResource<HTMLDivElement>(
    (editor) => {
      richRef.current = editor;
      const current = readRichMentionDraft(editor);
      if (
        sameRichMentionDraft(current, value, mentions, channelRefs) &&
        renderedAvatarKey.current === avatarKey
      )
        return () => {
          richRef.current = null;
        };
      const caret =
        requestedCaret.current ??
        (editor.ownerDocument.activeElement === editor
          ? richSelectionOffsets(editor)?.end
          : undefined);
      const mounts = renderRichMentionDraft(
        editor,
        value,
        mentions,
        mentionCandidates,
        channelRefs,
      );
      setAvatarMounts(mounts);
      renderedAvatarKey.current = avatarKey;
      requestedCaret.current = undefined;
      if (caret !== undefined) setRichSelection(editor, Math.min(caret, value.length));
      syncTextarea(editor);
      return () => {
        richRef.current = null;
      };
    },
    [value, mentions, channelRefs, mentionCandidates, channelCandidates, avatarKey, syncTextarea],
  );
  const textareaMount = useMountedResource<HTMLTextAreaElement>(
    (element) => {
      textareaRef.current = element;
      setAvatarMounts((current) => (current.length === 0 ? current : []));
      syncTextarea(element);
      return () => {
        textareaRef.current = null;
      };
    },
    [syncTextarea, value],
  );
  const replyId = reply?.id;
  const bodyMount = useMountedResource<HTMLDivElement>(
    (body) => {
      const element = body.querySelector<HTMLElement>('.bh-composer-input');
      if (replyId !== undefined || focusSignal > 0) element?.focus();
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
    },
    [syncTextarea, rich, replyId, focusSignal],
  );

  const emitRichChange = (editor: HTMLDivElement): void => {
    if (editor.innerHTML === '<br>') editor.replaceChildren();
    const next = readRichMentionDraft(editor);
    syncTextarea(editor);
    onChange(next.value, next.mentions, next.channelRefs);
    const caret = richSelectionOffsets(editor)?.end ?? next.value.length;
    setMentionQuery(activeMentionQuery(next.value, caret, next.mentions));
    setChannelQuery(activeChannelRefQuery(next.value, caret, next.channelRefs));
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
        onChange(
          deleted.value,
          deleted.mentions,
          rebaseChannelRefs(value, deleted.value, channelRefs),
        );
        setMentionQuery(undefined);
        setChannelQuery(undefined);
        if (input instanceof HTMLTextAreaElement)
          requestAnimationFrame(() => input.setSelectionRange(deleted.caret, deleted.caret));
        return;
      }
    }
    if (
      (event.key === 'Backspace' || event.key === 'Delete') &&
      !event.nativeEvent.isComposing &&
      selection !== undefined
    ) {
      const deleted = deleteSelectedChannelRef(
        value,
        channelRefs,
        selection.start,
        selection.end,
        event.key,
      );
      if (deleted !== undefined) {
        event.preventDefault();
        requestedCaret.current = deleted.caret;
        onChange(deleted.value, rebaseMentions(value, deleted.value, mentions), deleted.refs);
        setMentionQuery(undefined);
        setChannelQuery(undefined);
        return;
      }
    }
    if (channelQuery !== undefined && channelOptions.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveMentionIndex(
          (index) =>
            (index + (event.key === 'ArrowDown' ? 1 : -1) + channelOptions.length) %
            channelOptions.length,
        );
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        chooseChannel(channelOptions[activeMentionIndex] ?? channelOptions[0]!);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setChannelQuery(undefined);
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
      {channelQuery !== undefined && channelOptions.length > 0 ? (
        <div className="bh-mention-picker" role="listbox" aria-label="Reference a Group Channel">
          {channelOptions.map((candidate, index) => (
            <button
              key={candidate.id}
              type="button"
              className={`bh-mention-option${index === activeMentionIndex ? ' bh-mention-option-active' : ''}`}
              role="option"
              aria-selected={index === activeMentionIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => chooseChannel(candidate)}
            >
              <span className="bh-mention-option-copy">
                <strong>#{candidate.name}</strong>
              </span>
            </button>
          ))}
        </div>
      ) : null}
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
            {attachments.map((item) =>
              isImageAttachment(item.file) ? (
                <ComposerImageAttachment
                  key={item.id}
                  item={item}
                  t={t}
                  onRetry={() => onRetryAttachment?.(item.id)}
                  onRemove={() => onRemoveAttachment?.(item.id)}
                />
              ) : (
                <ComposerFileAttachment
                  key={item.id}
                  item={item}
                  t={t}
                  onRetry={() => onRetryAttachment?.(item.id)}
                  onRemove={() => onRemoveAttachment?.(item.id)}
                />
              ),
            )}
          </div>
        ) : null}
        <div ref={bodyMount} className="bh-composer-body">
          {rich ? (
            <div
              ref={richMount}
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
                if (handleFilePaste(event)) return;
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
              ref={textareaMount}
              className="bh-composer-input"
              rows={1}
              placeholder={placeholder}
              value={value}
              disabled={sending}
              onChange={(event) => {
                syncTextarea(event.currentTarget);
                const next = event.target.value;
                const nextMentions = rebaseMentions(value, next, mentions);
                const nextRefs = rebaseChannelRefs(value, next, channelRefs);
                onChange(next, nextMentions, nextRefs);
                setMentionQuery(
                  activeMentionQuery(next, event.currentTarget.selectionStart, nextMentions),
                );
                setChannelQuery(
                  activeChannelRefQuery(next, event.currentTarget.selectionStart, nextRefs),
                );
                setActiveMentionIndex(0);
              }}
              onPaste={(event) => {
                handleFilePaste(event);
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
          <IconPaperclipOutlineRegular size={16} />
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
