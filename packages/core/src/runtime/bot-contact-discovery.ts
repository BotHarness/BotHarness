import { createHash } from 'node:crypto';

import type { PersonaBotRegistry } from '../bots/registry.js';
import type { PersonaBotRecord } from '../bots/persona-bot.js';
import { isValidSlug } from '../bots/slug.js';

export const BOT_CONTACT_OUTPUT_LIMIT = 12_000;

export interface BotContactQuery {
  query?: string;
  cursor?: string;
  limit?: number;
  botId?: string;
}

export interface BotContact {
  botId: string;
  displayName: string;
  displayNameTruncated?: true;
  description?: string;
  descriptionTruncated?: true;
}

export interface BotContactPage {
  outputLimit: number;
  contacts: BotContact[];
  nextCursor?: string;
}

function project(bot: PersonaBotRecord, descriptionLimit: number): BotContact {
  return {
    botId: bot.slug,
    displayName: bot.displayName.slice(0, 128),
    ...(bot.displayName.length > 128 ? { displayNameTruncated: true } : {}),
    ...(bot.description === undefined
      ? {}
      : {
          description: bot.description.slice(0, descriptionLimit),
          ...(bot.description.length > descriptionLimit ? { descriptionTruncated: true } : {}),
        }),
  };
}

export function discoverBotContacts(
  registry: PersonaBotRegistry,
  ownerBotId: string,
  input: BotContactQuery = {},
): BotContactPage {
  if (input.botId !== undefined) {
    if (input.query !== undefined || input.cursor !== undefined || input.limit !== undefined)
      throw new Error('list_bot_contacts: bot_id detail cannot be combined with page arguments');
    const bot = registry.get(input.botId);
    if (bot === undefined || bot.slug === ownerBotId || bot.paused === true)
      throw new Error('list_bot_contacts: bot_id must identify an active colleague');
    return { outputLimit: BOT_CONTACT_OUTPUT_LIMIT, contacts: [project(bot, 1_000)] };
  }
  const query = input.query?.trim().toLowerCase() ?? '';
  if (query.length > 200)
    throw new Error('list_bot_contacts: query must be at most 200 characters');
  const limit = input.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw new Error('list_bot_contacts: limit must be an integer from 1 to 50');
  const filter = createHash('sha256').update(JSON.stringify({ ownerBotId, query })).digest('hex');
  let afterId: string | undefined;
  if (input.cursor !== undefined) {
    try {
      if (input.cursor.length > 512 || !/^[A-Za-z0-9_-]+$/u.test(input.cursor))
        throw new Error('invalid');
      const decoded: unknown = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8'));
      if (
        typeof decoded !== 'object' ||
        decoded === null ||
        !('version' in decoded) ||
        decoded.version !== 1 ||
        !('filter' in decoded) ||
        decoded.filter !== filter ||
        !('afterId' in decoded) ||
        typeof decoded.afterId !== 'string' ||
        !isValidSlug(decoded.afterId)
      )
        throw new Error('invalid');
      afterId = decoded.afterId;
    } catch {
      throw new Error('list_bot_contacts: invalid cursor; restart with unchanged query');
    }
  }
  const matching = registry
    .list()
    .filter((bot) => bot.slug !== ownerBotId && bot.paused !== true)
    .filter(
      (bot) =>
        query === '' ||
        [bot.slug, bot.displayName, bot.description ?? ''].some((value) =>
          value.toLowerCase().includes(query),
        ),
    )
    .filter((bot) => afterId === undefined || bot.slug > afterId)
    .sort((left, right) => (left.slug < right.slug ? -1 : left.slug > right.slug ? 1 : 0));
  const contacts: BotContact[] = [];
  const frame = (next: boolean): BotContactPage => ({
    outputLimit: BOT_CONTACT_OUTPUT_LIMIT,
    contacts,
    ...(next
      ? {
          nextCursor: Buffer.from(
            JSON.stringify({ version: 1, filter, afterId: contacts.at(-1)!.botId }),
          ).toString('base64url'),
        }
      : {}),
  });
  for (const bot of matching.slice(0, limit)) {
    contacts.push(project(bot, 160));
    if (
      JSON.stringify(frame(contacts.length < matching.length)).length > BOT_CONTACT_OUTPUT_LIMIT
    ) {
      contacts.pop();
      break;
    }
  }
  return frame(contacts.length < matching.length);
}
