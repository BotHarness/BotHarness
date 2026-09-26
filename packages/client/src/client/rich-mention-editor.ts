import type { SelectedMention } from './mentions.js';
import { referenceRuns, type SelectedChannelRef } from './channel-refs.js';
import type { BotSummary } from './store.js';

export interface MentionAvatarMount {
  target: HTMLElement;
  botSlug: string;
  name: string;
  src?: string | undefined;
}
export interface RichMentionDraft {
  value: string;
  mentions: SelectedMention[];
  channelRefs: SelectedChannelRef[];
}

function token(
  node: Node,
):
  | { kind: 'bot'; botSlug: string; label: string }
  | { kind: 'channel'; channelId: string; label: string }
  | undefined {
  if (!(node instanceof HTMLElement)) return undefined;
  const label = node.dataset.mentionLabel;
  if (label === undefined) return undefined;
  const botSlug = node.dataset.botId;
  if (botSlug !== undefined) return { kind: 'bot', botSlug, label };
  const channelId = node.dataset.channelId;
  if (channelId !== undefined) return { kind: 'channel', channelId, label };
  return undefined;
}

function rawLength(node: Node): number {
  const mention = token(node);
  if (mention !== undefined) return mention.label.length + 1;
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.length ?? 0;
  if (node instanceof HTMLBRElement) return 1;
  let length = 0;
  for (const child of node.childNodes) length += rawLength(child);
  return length;
}

export function renderRichMentionDraft(
  editor: HTMLElement,
  value: string,
  mentions: readonly SelectedMention[],
  bots: readonly BotSummary[],
  refs: readonly SelectedChannelRef[] = [],
): MentionAvatarMount[] {
  const document = editor.ownerDocument;
  const nodes: Node[] = [];
  const mounts: MentionAvatarMount[] = [];
  for (const run of referenceRuns(value, mentions, refs)) {
    if (run.mention === undefined && run.channelRef === undefined) {
      nodes.push(document.createTextNode(run.text));
      continue;
    }
    if (run.channelRef !== undefined) {
      const ref = run.channelRef;
      const badge = document.createElement('span');
      badge.className = 'bh-inline-mention bh-inline-mention-sent bh-composer-inline-mention';
      badge.contentEditable = 'false';
      badge.dataset.channelId = ref.channelId;
      badge.dataset.mentionLabel = ref.label;
      badge.textContent = '#' + ref.label;
      nodes.push(badge);
      continue;
    }
    const mention = run.mention;
    const bot = bots.find((candidate) => candidate.slug === mention.botSlug);
    const badge = document.createElement('span');
    badge.className = 'bh-inline-mention bh-inline-mention-sent bh-composer-inline-mention';
    badge.contentEditable = 'false';
    badge.dataset.botId = mention.botSlug;
    badge.dataset.mentionLabel = mention.label;
    const avatar = document.createElement('span');
    avatar.className = 'bh-inline-mention-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = mention.label;
    badge.append(avatar, label);
    nodes.push(badge);
    mounts.push({
      target: avatar,
      botSlug: mention.botSlug,
      name: bot?.displayName ?? mention.label,
      src: bot?.avatar,
    });
  }
  editor.replaceChildren(...nodes);
  return mounts;
}

export function readRichMentionDraft(editor: HTMLElement): RichMentionDraft {
  let value = '';
  const mentions: SelectedMention[] = [];
  const channelRefs: SelectedChannelRef[] = [];
  const append = (node: Node): void => {
    const mention = token(node);
    if (mention !== undefined) {
      const start = value.length;
      value += (mention.kind === 'bot' ? '@' : '#') + mention.label;
      if (mention.kind === 'bot')
        mentions.push({ botSlug: mention.botSlug, label: mention.label, start, end: value.length });
      else
        channelRefs.push({
          channelId: mention.channelId,
          label: mention.label,
          start,
          end: value.length,
        });
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      value += (node.textContent ?? '').replaceAll('\u00a0', ' ');
      return;
    }
    if (node instanceof HTMLBRElement) {
      value += '\n';
      return;
    }
    for (const child of node.childNodes) append(child);
  };
  for (const child of editor.childNodes) append(child);
  return { value, mentions, channelRefs };
}

export function sameRichMentionDraft(
  left: RichMentionDraft,
  value: string,
  mentions: readonly SelectedMention[],
  refs: readonly SelectedChannelRef[],
): boolean {
  return (
    left.value === value &&
    left.mentions.length === mentions.length &&
    left.mentions.every(
      (item, index) =>
        item.botSlug === mentions[index]?.botSlug &&
        item.label === mentions[index]?.label &&
        item.start === mentions[index]?.start &&
        item.end === mentions[index]?.end,
    ) &&
    left.channelRefs.length === refs.length &&
    left.channelRefs.every(
      (item, index) =>
        item.channelId === refs[index]?.channelId &&
        item.label === refs[index]?.label &&
        item.start === refs[index]?.start &&
        item.end === refs[index]?.end,
    )
  );
}

function offsetAt(editor: HTMLElement, target: Node, offset: number): number {
  let count = 0;
  const visit = (node: Node): boolean => {
    if (node === target) {
      if (node.nodeType === Node.TEXT_NODE)
        count += Math.min(offset, node.textContent?.length ?? 0);
      else
        for (let index = 0; index < Math.min(offset, node.childNodes.length); index += 1)
          count += rawLength(node.childNodes[index]!);
      return true;
    }
    const mention = token(node);
    if (mention !== undefined) {
      count += mention.label.length + 1;
      return node.contains(target);
    }
    if (node.nodeType === Node.TEXT_NODE || node instanceof HTMLBRElement) {
      count += rawLength(node);
      return false;
    }
    for (const child of node.childNodes) if (visit(child)) return true;
    return false;
  };
  visit(editor);
  return count;
}

export function richSelectionOffsets(
  editor: HTMLElement,
): { start: number; end: number } | undefined {
  const selection = editor.ownerDocument.defaultView?.getSelection();
  if (selection === undefined || selection === null || selection.rangeCount === 0) return undefined;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer))
    return undefined;
  return {
    start: offsetAt(editor, range.startContainer, range.startOffset),
    end: offsetAt(editor, range.endContainer, range.endOffset),
  };
}

function pointAt(editor: HTMLElement, desired: number): { node: Node; offset: number } {
  let remaining = Math.max(0, desired);
  const visit = (parent: Node): { node: Node; offset: number } => {
    for (let index = 0; index < parent.childNodes.length; index += 1) {
      const child = parent.childNodes[index]!;
      const length = rawLength(child);
      if (remaining > length) {
        remaining -= length;
        continue;
      }
      if (child.nodeType === Node.TEXT_NODE)
        return { node: child, offset: Math.min(remaining, length) };
      if (token(child) !== undefined || child instanceof HTMLBRElement)
        return { node: parent, offset: index + (remaining > 0 ? 1 : 0) };
      return visit(child);
    }
    return { node: parent, offset: parent.childNodes.length };
  };
  return visit(editor);
}

export function setRichSelection(editor: HTMLElement, start: number, end = start): void {
  const selection = editor.ownerDocument.defaultView?.getSelection();
  if (selection === undefined || selection === null) return;
  const range = editor.ownerDocument.createRange();
  const from = pointAt(editor, start);
  const to = pointAt(editor, end);
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function insertRichPlainText(editor: HTMLElement, text: string): void {
  const selection = editor.ownerDocument.defaultView?.getSelection();
  if (selection === undefined || selection === null) return;
  const range =
    selection.rangeCount > 0 && editor.contains(selection.getRangeAt(0).startContainer)
      ? selection.getRangeAt(0)
      : editor.ownerDocument.createRange();
  if (!editor.contains(range.startContainer)) {
    range.selectNodeContents(editor);
    range.collapse(false);
  }
  range.deleteContents();
  const node = editor.ownerDocument.createTextNode(text);
  range.insertNode(node);
  range.setStart(node, text.length);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}
