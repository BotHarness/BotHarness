import type { MessagingInboundEvent } from './provider.js';

type Mention = MessagingInboundEvent['mentions'][number];
type Actor = MessagingInboundEvent['actor'];

export function withMentionNames(text: string, mentions: readonly Mention[] | undefined): string {
  if (mentions === undefined || mentions.length === 0) return text;
  return [...mentions]
    .filter((mention) => mention.key.length > 0)
    .sort((left, right) => right.key.length - left.key.length)
    .reduce(
      (current, mention) => current.replaceAll(mention.key, `@${mention.name ?? mention.id}`),
      text,
    );
}

export function mentionPeople(
  actor: Actor | undefined,
  mentions: readonly Mention[] | undefined,
): { role: 'sender' | 'mentioned'; name?: string; id: string }[] {
  const people = new Map<string, { role: 'sender' | 'mentioned'; name?: string; id: string }>();
  if (actor !== undefined && actor.id.length > 0)
    people.set(actor.id, {
      role: 'sender',
      id: actor.id,
      ...(actor.name ? { name: actor.name } : {}),
    });
  for (const mention of mentions ?? [])
    if (!people.has(mention.id))
      people.set(mention.id, {
        role: 'mentioned',
        id: mention.id,
        ...(mention.name ? { name: mention.name } : {}),
      });
  return [...people.values()];
}

export function withoutMentionMarkup(text: string): string {
  return text
    .replace(/<at\b[^>]*>(.*?)<\/at>/gisu, (_tag, name: string) => `@${name.trim() || 'someone'}`)
    .replace(/<\/?at\b[^>]*>/giu, '');
}

export function mentionMarkup(platform: string, id: string, name?: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(id)) throw new Error(`Invalid platform user id ${id}`);
  if (['feishu', 'lark', 'slack', 'discord'].includes(platform))
    return `<at user_id="${id}">${(name ?? '').replace(/[<>&"]/gu, '')}</at>`;
  throw new Error(`Mentions are not supported on ${platform}`);
}

export function leadingMentions(text: string): {
  mentions: { id: string; name: string }[];
  text: string;
} {
  const mentions: { id: string; name: string }[] = [];
  let rest = text;
  for (;;) {
    const match = /^<at user_id="([A-Za-z0-9_-]{1,128})">([^<]*)<\/at>\s*/u.exec(rest);
    if (match === null) return { mentions, text: rest };
    mentions.push({ id: match[1]!, name: match[2]! });
    rest = rest.slice(match[0].length);
  }
}
