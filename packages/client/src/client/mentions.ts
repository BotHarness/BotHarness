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
  if (/[\n\r@]/u.test(query)) return undefined;
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
