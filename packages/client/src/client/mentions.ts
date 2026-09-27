export interface SelectedMention {
  botSlug: string;
  label: string;
  start: number;
  end: number;
}

export interface MentionQuery {
  start: number;
  end: number;
  query: string;
}

/** Preserve identity only for untouched spans after a textarea edit. */
export function rebaseMentions(
  before: string,
  after: string,
  mentions: readonly SelectedMention[],
): SelectedMention[] {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix])
    prefix += 1;
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - suffix - 1] === after[after.length - suffix - 1]
  )
    suffix += 1;
  const oldEnd = before.length - suffix;
  const delta = after.length - before.length;
  return mentions
    .flatMap((item) => {
      if (item.end <= prefix) return [item];
      if (item.start >= oldEnd)
        return [{ ...item, start: item.start + delta, end: item.end + delta }];
      return [];
    })
    .filter((item) => after.slice(item.start, item.end) === '@' + item.label);
}

/** Plain typed @text is a search query, never a selected identity. */
export function activeMentionQuery(
  value: string,
  caret: number,
  mentions: readonly SelectedMention[],
): MentionQuery | undefined {
  const start = value.lastIndexOf('@', caret - 1);
  if (start < 0 || caret - start > 34 || (start > 0 && !/[\s([{]/u.test(value[start - 1]!)))
    return undefined;
  const query = value.slice(start + 1, caret);
  if (/[\n\r@#]/u.test(query)) return undefined;
  if (mentions.some((item) => item.start === start && item.end <= caret)) return undefined;
  return { start, end: caret, query };
}

export function selectMention(
  value: string,
  mentions: readonly SelectedMention[],
  query: MentionQuery,
  botSlug: string,
  label: string,
): { value: string; mentions: SelectedMention[]; caret: number } {
  const token = '@' + label;
  const trailing = value[query.end] === ' ' ? '' : ' ';
  const next = value.slice(0, query.start) + token + trailing + value.slice(query.end);
  const rebased = rebaseMentions(value, next, mentions);
  const selected = { botSlug, label, start: query.start, end: query.start + token.length };
  return {
    value: next,
    mentions: [...rebased, selected].sort((a, b) => a.start - b.start),
    caret: selected.end + trailing.length,
  };
}

/** Render only spans whose persisted identity still matches the visible text. */
export function mentionRuns(
  value: string,
  mentions: readonly SelectedMention[],
): Array<{ text: string; mention?: SelectedMention }> {
  const runs: Array<{ text: string; mention?: SelectedMention }> = [];
  let cursor = 0;
  for (const mention of [...mentions].sort((a, b) => a.start - b.start)) {
    if (mention.start < cursor || value.slice(mention.start, mention.end) !== '@' + mention.label)
      continue;
    if (mention.start > cursor) runs.push({ text: value.slice(cursor, mention.start) });
    runs.push({ text: value.slice(mention.start, mention.end), mention });
    cursor = mention.end;
  }
  if (cursor < value.length) runs.push({ text: value.slice(cursor) });
  return runs;
}

/** Backspace/Delete treats a selected mention and its insertion space as one unit. */
export function deleteSelectedMention(
  value: string,
  mentions: readonly SelectedMention[],
  selectionStart: number,
  selectionEnd: number,
  key: 'Backspace' | 'Delete',
): { value: string; mentions: SelectedMention[]; caret: number } | undefined {
  const target = mentions.find((mention) => {
    const trailingEnd = value[mention.end] === ' ' ? mention.end + 1 : mention.end;
    if (selectionStart !== selectionEnd)
      return selectionStart < trailingEnd && selectionEnd > mention.start;
    return key === 'Backspace'
      ? selectionStart > mention.start && selectionStart <= trailingEnd
      : selectionStart >= mention.start && selectionStart < mention.end;
  });
  if (target === undefined) return undefined;
  const end = value[target.end] === ' ' ? target.end + 1 : target.end;
  const start =
    selectionStart === selectionEnd ? target.start : Math.min(selectionStart, target.start);
  const finish = selectionStart === selectionEnd ? end : Math.max(selectionEnd, end);
  const next = value.slice(0, start) + value.slice(finish);
  return { value: next, mentions: rebaseMentions(value, next, mentions), caret: start };
}

/** DSH Session prose otherwise projects bare @refs as file chips. */
export function sessionBotReference(botSlug: string): string {
  return '\u2060@' + botSlug;
}
