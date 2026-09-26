import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { isValidSlug } from '../bots/slug.js';
import { ChannelAttachmentError } from '../attachments/store.js';
import { isChannelAttachmentRef, type ChannelAttachmentRef } from '../attachments/ref.js';
import {
  botDmChannelId,
  dmChannelId,
  isBotDmChannel,
  MAX_BOT_HOPS,
  groupChannelIdBase,
  isChannelMessage,
  isChannelRecord,
  isValidChannelId,
  type ChannelMessage,
  type ChannelRecord,
  type GroupInvitation,
  type GroupJoinRequest,
} from './channel.js';
import {
  ChannelMentionTargetError,
  ChannelReplyTargetError,
  prepareChannelMessageQuery,
  type ChannelStore,
  type ChannelStoreOptions,
} from './store.js';
import { DEFAULT_MESSAGE_PAGE, MAX_MESSAGE_PAGE, pageChannelTimeline } from './timeline.js';

interface SqliteChannelStoreOptions extends ChannelStoreOptions {
  database: OperationalDatabaseModulePort;
  databaseOwnerReady?: boolean;
}

interface PlacementRow {
  source_event_id: string;
  payload_json: string;
  body: string;
}

interface AdmissionRow {
  bot_slug: string;
  attempt_state: string;
}

function parseRecord(value: string, id: string): ChannelRecord | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    return isChannelRecord(parsed, id) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parseMessage(value: string, body?: string): ChannelMessage | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    const candidate = body === undefined ? parsed : { ...(parsed as object), body };
    return isChannelMessage(candidate) ? candidate : undefined;
  } catch {
    return undefined;
  }
}

function replyProjection(
  message: ChannelMessage,
  byId: ReadonlyMap<string, ChannelMessage>,
): ChannelMessage {
  if (message.replyTo === undefined) return message;
  const target = byId.get(message.replyTo);
  if (target === undefined) return { ...message, replyToPreview: null };
  const normalized = target.body.replace(/\s+/gu, ' ').trim();
  const characters = Array.from(normalized);
  return {
    ...message,
    replyToPreview: {
      author: target.author,
      body: characters.length > 140 ? characters.slice(0, 140).join('') + '...' : normalized,
    },
  };
}

function sameIntent(left: ChannelMessage, right: ChannelMessage): boolean {
  return (
    JSON.stringify({
      author: left.author,
      body: left.body,
      attachments: left.attachments ?? [],
      replyTo: left.replyTo,
      memorySwitchTarget: left.memorySwitchTarget,
      mentions: left.mentions ?? [],
      channelRefs: left.channelRefs ?? [],
      botDmAction: left.botDmAction,
      botCausation: left.botCausation,
    }) ===
    JSON.stringify({
      author: right.author,
      body: right.body,
      attachments: right.attachments ?? [],
      replyTo: right.replyTo,
      memorySwitchTarget: right.memorySwitchTarget,
      mentions: right.mentions ?? [],
      channelRefs: right.channelRefs ?? [],
      botDmAction: right.botDmAction,
      botCausation: right.botCausation,
    })
  );
}

function sourceKind(message: ChannelMessage): string {
  return message.author.kind === 'human'
    ? 'human-message'
    : message.author.kind === 'bot'
      ? 'bot-message'
      : 'system-message';
}

function rawMessage(message: ChannelMessage): ChannelMessage {
  const result = { ...message };
  delete result.replyToPreview;
  delete result.deliveries;
  return result;
}

function eventPayload(message: ChannelMessage): string {
  const { body: _body, ...envelope } = rawMessage(message);
  return JSON.stringify(envelope);
}

/**
 * Production Channel authority. The legacy NDJSON directory is consumed once
 * on an empty Channel schema, then never read or written by this store.
 */
export function createSqliteChannelStore(options: SqliteChannelStoreOptions): ChannelStore {
  const { database, rootDir } = options;
  const now = options.now ?? (() => new Date());
  let lowerRegistered = false;
  const assertAttachmentRefs = (refs: readonly ChannelAttachmentRef[]): void => {
    if (
      refs.length > 10 ||
      refs.some((ref) => !isChannelAttachmentRef(ref) || !options.attachments?.has(ref))
    )
      throw new ChannelAttachmentError('Attachment does not belong to this profile', 'invalid-ref');
  };

  const readRecord = (id: string): ChannelRecord | undefined => {
    if (!isValidChannelId(id)) return undefined;
    const row = database.read((db) =>
      db.prepare('SELECT record_json FROM channel_records WHERE channel_id = ?').get(id),
    ) as { record_json: string } | undefined;
    if (row === undefined) return undefined;
    const record = parseRecord(row.record_json, id);
    return record?.deletedAt === undefined ? record : undefined;
  };

  const publishRecordChanged = (): void => {
    try {
      options.onRecordChanged?.();
    } catch (error) {
      options.warn?.('Channel record notification failed: ' + String(error));
    }
  };

  const writeRecord = (record: ChannelRecord): void => {
    database.transaction(
      (db) => {
        db.prepare(`INSERT INTO channel_records (channel_id, record_json) VALUES (?, ?)
        ON CONFLICT(channel_id) DO UPDATE SET record_json = excluded.record_json`).run(
          record.id,
          JSON.stringify(record),
        );
      },
      ['channel'],
    );
    publishRecordChanged();
  };

  const admissionStatuses = (sourceEventId: string): ChannelMessage['deliveries'] => {
    const rows = database.read((db) =>
      db
        .prepare(
          'SELECT bot_slug, attempt_state FROM inbox_admissions WHERE source_event_id = ? ORDER BY bot_slug',
        )
        .all(sourceEventId),
    ) as unknown as AdmissionRow[];
    return rows.length === 0
      ? undefined
      : rows.map((row) => ({
          botSlug: row.bot_slug,
          state: row.attempt_state as NonNullable<ChannelMessage['deliveries']>[number]['state'],
        }));
  };

  const allMessages = (id: string): ChannelMessage[] => {
    if (!isValidChannelId(id)) return [];
    const rows = database.read((db) =>
      db
        .prepare(`
      SELECT p.source_event_id, e.payload_json, e.body
        FROM channel_placements p
        JOIN source_events e ON e.source_event_id = p.source_event_id
       WHERE p.channel_id = ? ORDER BY p.revision
    `)
        .all(id),
    ) as unknown as PlacementRow[];
    return rows.flatMap((row) => {
      const message = parseMessage(row.payload_json, row.body);
      if (message === undefined) return [];
      const deliveries = admissionStatuses(row.source_event_id);
      return [{ ...message, ...(deliveries === undefined ? {} : { deliveries }) }];
    });
  };

  const project = (messages: ChannelMessage[], message: ChannelMessage): ChannelMessage =>
    replyProjection(message, new Map(messages.map((item) => [item.id, item])));

  const revisionOf = (id: string): number => {
    if (!isValidChannelId(id)) return 0;
    const row = database.read((db) =>
      db
        .prepare(
          'SELECT COALESCE(MAX(revision), 0) AS revision FROM channel_placements WHERE channel_id = ?',
        )
        .get(id),
    ) as { revision: number };
    return row.revision;
  };

  const append = (id: string, message: ChannelMessage, once: boolean) => {
    const channel = readRecord(id);
    if (channel === undefined) return once ? { status: 'missing' as const } : undefined;
    const previous = allMessages(id);
    const existing = previous.find((item) => item.id === message.id);
    if (existing !== undefined) {
      if (!once || !sameIntent(existing, message)) return { status: 'conflict' as const };
      return { status: 'existing' as const, message: project(previous, existing) };
    }
    if (message.replyTo !== undefined && !previous.some((item) => item.id === message.replyTo))
      throw new ChannelReplyTargetError();
    assertAttachmentRefs(message.attachments ?? []);
    const mentions = message.mentions ?? [];
    if (
      mentions.length > 0 &&
      (channel.type === 'group'
        ? mentions.some(
            (item) =>
              !channel.members.includes(item.botSlug) ||
              message.body.slice(item.start, item.end) !== '@' + item.label,
          )
        : channel.botSlug === undefined ||
          message.author.kind !== 'human' ||
          mentions.some(
            (item) =>
              item.botSlug === channel.botSlug ||
              message.body.slice(item.start, item.end) !== '@' + item.label,
          ))
    ) {
      throw new ChannelMentionTargetError();
    }
    if (
      (message.channelRefs?.length ?? 0) > 0 &&
      (channel.type !== 'dm' ||
        channel.botSlug === undefined ||
        message.author.kind !== 'human' ||
        message.channelRefs?.some((ref) => {
          const target = readRecord(ref.channelId);
          return (
            target?.type !== 'group' || message.body.slice(ref.start, ref.end) !== '#' + ref.label
          );
        }))
    )
      throw new Error('Selected #Channel reference is no longer available');
    const senderSlug = message.author.kind === 'bot' ? message.author.slug : undefined;
    if (
      channel.type === 'group' &&
      senderSlug !== undefined &&
      !channel.members.includes(senderSlug)
    )
      throw new Error('Only a joined Bot may author this Group Channel');
    if (
      channel.type === 'group' &&
      senderSlug !== undefined &&
      mentions.length > 0 &&
      message.botCausation === undefined
    )
      throw new Error('Bot Group mentions require trusted causation');
    const botDm = isBotDmChannel(channel) && senderSlug !== undefined;
    if (
      isBotDmChannel(channel) &&
      (senderSlug === undefined || !channel.members.includes(senderSlug))
    )
      throw new Error('Only a Bot DM participant may author this Channel');
    if (botDm && message.botCausation === undefined)
      throw new Error('Bot DM send requires trusted causation');
    const senderDm =
      botDm && senderSlug !== undefined ? readRecord(dmChannelId(senderSlug)) : undefined;
    if (botDm && (senderDm?.type !== 'dm' || senderDm.botSlug !== senderSlug))
      throw new Error('Sender Human DM is unavailable for the Bot action notice');
    const recipient = botDm ? channel.members.find((slug) => slug !== senderSlug) : undefined;
    if (botDm && recipient === undefined) throw new Error('Bot DM has no recipient');
    const durable = rawMessage(message);
    const revision = previous.length + 1;
    const sourceEventId = randomUUID();
    const action: ChannelMessage | undefined =
      botDm && senderDm !== undefined && recipient !== undefined && senderSlug !== undefined
        ? {
            id: `bot-dm-action-${durable.id}`,
            at: durable.at,
            author: { kind: 'bot', slug: senderSlug },
            body: '',
            botDmAction: { channelId: id, messageId: durable.id, recipientBotSlug: recipient },
          }
        : undefined;
    const actionRevision = senderDm === undefined ? undefined : allMessages(senderDm.id).length + 1;
    database.transaction(
      (db) => {
        db.prepare(`
        INSERT INTO source_events (
          source_event_id, source_kind, bot_slug, channel_id, message_id,
          body, created_at, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
          sourceEventId,
          sourceKind(durable),
          durable.author.kind === 'bot'
            ? durable.author.slug
            : channel.type === 'dm' && durable.author.kind === 'human'
              ? (channel.botSlug ?? null)
              : null,
          id,
          durable.id,
          durable.body,
          durable.at,
          eventPayload(durable),
        );
        db.prepare(`
        INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id)
        VALUES (?, ?, ?, ?)
      `).run(id, revision, sourceEventId, durable.id);
        const botAlreadyAdmitted = (targetSlug: string, rootId: string): boolean =>
          db
            .prepare(`
              SELECT 1 FROM inbox_admissions a
              JOIN source_events e ON e.source_event_id = a.source_event_id
              WHERE a.bot_slug = ? AND e.source_kind = 'bot-message'
                AND json_extract(e.payload_json, '$.botCausation.rootSourceEventId') = ?
              LIMIT 1
            `)
            .get(targetSlug, rootId) !== undefined;
        const recipients =
          durable.author.kind === 'human'
            ? channel.type === 'dm' && channel.botSlug !== undefined
              ? [{ botSlug: channel.botSlug, reason: 'human-dm' }]
              : [...new Set(mentions.map((item) => item.botSlug))].map((botSlug) => ({
                  botSlug,
                  reason: 'group-mention',
                }))
            : channel.type === 'group' &&
                senderSlug !== undefined &&
                durable.botCausation !== undefined &&
                durable.botCausation.hop <= MAX_BOT_HOPS
              ? [...new Set(mentions.map((item) => item.botSlug))]
                  .filter(
                    (targetSlug) =>
                      targetSlug !== senderSlug &&
                      !botAlreadyAdmitted(targetSlug, durable.botCausation!.rootSourceEventId),
                  )
                  .map((botSlug) => ({ botSlug, reason: 'group-mention' }))
              : botDm &&
                  recipient !== undefined &&
                  durable.botCausation !== undefined &&
                  durable.botCausation.hop <= MAX_BOT_HOPS &&
                  !botAlreadyAdmitted(recipient, durable.botCausation.rootSourceEventId)
                ? [{ botSlug: recipient, reason: 'bot-dm' }]
                : [];
        const immediate = new Set(recipients.map((item) => item.botSlug));
        const ordinaryAllowed =
          durable.author.kind === 'human' ||
          (senderSlug !== undefined &&
            durable.botCausation !== undefined &&
            durable.botCausation.hop <= MAX_BOT_HOPS);
        const ordinary =
          channel.type === 'group' && ordinaryAllowed
            ? channel.members.flatMap((botSlug) => {
                if (botSlug === senderSlug || immediate.has(botSlug)) return [];
                const policy = channel.wakePolicies?.[botSlug];
                if (policy?.mode !== 'digest') return [];
                if (
                  durable.author.kind === 'bot' &&
                  durable.botCausation !== undefined &&
                  botAlreadyAdmitted(botSlug, durable.botCausation.rootSourceEventId)
                )
                  return [];
                return [{ botSlug, policy }];
              })
            : [];
        for (const recipient of recipients)
          db.prepare(`
        INSERT INTO inbox_admissions (source_event_id, bot_slug, reason)
        VALUES (?, ?, ?)
      `).run(sourceEventId, recipient.botSlug, recipient.reason);
        for (const recipient of ordinary)
          db.prepare(`
        INSERT INTO inbox_admissions (
          source_event_id, bot_slug, reason, wake_count, wake_interval_ms, wake_policy_revision
        ) VALUES (?, ?, 'group-ordinary', ?, ?, ?)
      `).run(
            sourceEventId,
            recipient.botSlug,
            recipient.policy.count,
            recipient.policy.intervalSeconds * 1000,
            recipient.policy.revision,
          );
        db.prepare('UPDATE channel_records SET record_json = ? WHERE channel_id = ?').run(
          JSON.stringify({ ...channel, updatedAt: now().toISOString() }),
          id,
        );
        if (
          action !== undefined &&
          senderDm !== undefined &&
          actionRevision !== undefined &&
          senderSlug !== undefined
        ) {
          const actionSourceEventId = randomUUID();
          db.prepare(`
            INSERT INTO source_events (
              source_event_id, source_kind, bot_slug, channel_id, message_id,
              body, created_at, payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            actionSourceEventId,
            'bot-message',
            senderSlug,
            senderDm.id,
            action.id,
            '',
            action.at,
            eventPayload(action),
          );
          db.prepare(`
            INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id)
            VALUES (?, ?, ?, ?)
          `).run(senderDm.id, actionRevision, actionSourceEventId, action.id);
          db.prepare('UPDATE channel_records SET record_json = ? WHERE channel_id = ?').run(
            JSON.stringify({ ...senderDm, updatedAt: now().toISOString() }),
            senderDm.id,
          );
        }
      },
      ['source-event', 'channel', 'bot-inbox'],
    );
    const committed = project([...previous, durable], durable);
    const deliveries = admissionStatuses(sourceEventId);
    const result = { ...committed, ...(deliveries === undefined ? {} : { deliveries }) };
    for (const commit of [
      { channelId: id, message: result, revision },
      ...(action === undefined || senderDm === undefined || actionRevision === undefined
        ? []
        : [{ channelId: senderDm.id, message: action, revision: actionRevision }]),
    ]) {
      try {
        options.onCommitted?.(commit);
      } catch (error) {
        options.warn?.(`Channel post-commit notification failed: ${String(error)}`);
      }
    }
    return { status: 'appended' as const, message: result };
  };

  // Import is a single transaction. An existing SQL Channel row means the
  // prior import committed; old files can never supersede that authority.
  if (
    options.databaseOwnerReady !== false &&
    database.read((db) => db.prepare('SELECT channel_id FROM channel_records LIMIT 1').get()) ===
      undefined &&
    existsSync(rootDir)
  ) {
    const legacy: Array<{
      record: ChannelRecord;
      messages: ChannelMessage[];
      readPosition?: {
        messageId: string;
        revision: number;
        readAt: string;
      };
    }> = [];
    for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !isValidChannelId(entry.name)) continue;
      const directory = join(rootDir, entry.name);
      let record: ChannelRecord | undefined;
      try {
        record = parseRecord(readFileSync(join(directory, 'channel.json'), 'utf8'), entry.name);
      } catch {
        continue;
      }
      if (record === undefined) continue;
      let messages: ChannelMessage[] = [];
      try {
        messages = readFileSync(join(directory, 'messages.ndjson'), 'utf8')
          .split('\n')
          .flatMap((line) => {
            const parsed = parseMessage(line);
            return parsed === undefined ? [] : [parsed];
          });
      } catch {
        /* Empty history. */
      }
      let readPosition: { messageId: string; revision: number; readAt: string } | undefined;
      try {
        const parsed: unknown = JSON.parse(
          readFileSync(join(directory, 'read-position.json'), 'utf8'),
        );
        if (typeof parsed === 'object' && parsed !== null) {
          const value = parsed as Record<string, unknown>;
          if (
            typeof value['messageId'] === 'string' &&
            typeof value['revision'] === 'number' &&
            typeof value['readAt'] === 'string' &&
            messages[value['revision'] - 1]?.id === value['messageId']
          ) {
            readPosition = {
              messageId: value['messageId'],
              revision: value['revision'],
              readAt: value['readAt'],
            };
          }
        }
      } catch {
        /* No read position. */
      }
      legacy.push({ record, messages, ...(readPosition === undefined ? {} : { readPosition }) });
    }
    database.transaction(
      (db) => {
        for (const { record, messages, readPosition } of legacy) {
          db.prepare('INSERT INTO channel_records (channel_id, record_json) VALUES (?, ?)').run(
            record.id,
            JSON.stringify(record),
          );
          for (const [index, message] of messages.entries()) {
            const existing = db
              .prepare(
                'SELECT source_event_id FROM source_events WHERE channel_id = ? AND message_id = ?',
              )
              .get(record.id, message.id) as { source_event_id: string } | undefined;
            const sourceEventId = existing?.source_event_id ?? randomUUID();
            if (existing === undefined)
              db.prepare(`
            INSERT INTO source_events (
              source_event_id, source_kind, bot_slug, channel_id, message_id,
              body, created_at, attempt_state, payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'handled', ?)
          `).run(
                sourceEventId,
                sourceKind(message),
                message.author.kind === 'bot'
                  ? message.author.slug
                  : record.type === 'dm' && message.author.kind === 'human'
                    ? (record.botSlug ?? null)
                    : null,
                record.id,
                message.id,
                message.body,
                message.at,
                eventPayload(message),
              );
            else
              db.prepare('UPDATE source_events SET payload_json = ? WHERE source_event_id = ?').run(
                eventPayload(message),
                sourceEventId,
              );
            if (
              record.type === 'dm' &&
              message.author.kind === 'human' &&
              record.botSlug !== undefined
            )
              db.prepare(`
              INSERT OR IGNORE INTO inbox_admissions (
                source_event_id, bot_slug, reason, attempt_state, handled_at
              )
              SELECT source_event_id, ?, 'human-dm', attempt_state, handled_at
                FROM source_events WHERE source_event_id = ?
            `).run(record.botSlug, sourceEventId);
            db.prepare(`
            INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id)
            VALUES (?, ?, ?, ?)
          `).run(record.id, index + 1, sourceEventId, message.id);
          }
          if (readPosition !== undefined)
            db.prepare(`
          INSERT INTO channel_read_positions (channel_id, message_id, revision, read_at)
          VALUES (?, ?, ?, ?)
        `).run(record.id, readPosition.messageId, readPosition.revision, readPosition.readAt);
        }
      },
      ['channel', 'source-event'],
    );
  }

  return {
    rootDir,
    get: readRecord,
    list() {
      const rows = database.read((db) =>
        db.prepare('SELECT channel_id, record_json FROM channel_records').all(),
      ) as unknown as Array<{ channel_id: string; record_json: string }>;
      return rows
        .flatMap((row) => {
          const record = parseRecord(row.record_json, row.channel_id);
          return record === undefined || record.deletedAt !== undefined ? [] : [record];
        })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
    },
    getOrCreateDm(botSlug, botName) {
      if (!isValidSlug(botSlug)) return undefined;
      const id = dmChannelId(botSlug);
      const existing = readRecord(id);
      if (existing !== undefined) return existing;
      const timestamp = now().toISOString();
      const record: ChannelRecord = {
        id,
        type: 'dm',
        name: botName.trim() || botSlug,
        members: [botSlug],
        botSlug,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      writeRecord(record);
      return record;
    },
    getOrCreateBotDm(firstBotSlug, secondBotSlug, name) {
      if (
        !isValidSlug(firstBotSlug) ||
        !isValidSlug(secondBotSlug) ||
        firstBotSlug === secondBotSlug
      )
        return undefined;
      const id = botDmChannelId(firstBotSlug, secondBotSlug);
      const members = [firstBotSlug, secondBotSlug].sort();
      const existing = readRecord(id);
      if (existing !== undefined) {
        if (
          existing.type !== 'dm' ||
          existing.botSlug !== undefined ||
          JSON.stringify(existing.members) !== JSON.stringify(members)
        )
          throw new Error(`Bot DM identity collision: ${id}`);
        return existing;
      }
      const timestamp = now().toISOString();
      const record: ChannelRecord = {
        id,
        type: 'dm',
        name: name.trim() || members.join(' · '),
        members,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      writeRecord(record);
      return record;
    },
    createGroup(input) {
      const base = groupChannelIdBase(input.name);
      let id = base;
      for (let suffix = 2; readRecord(id) !== undefined; suffix++) id = `${base}-${suffix}`;
      const timestamp = now().toISOString();
      const record: ChannelRecord = {
        id,
        type: 'group',
        name: input.name.trim() || id,
        members: [...input.members],
        ...(input.ownerBotSlug === undefined ? {} : { ownerBotSlug: input.ownerBotSlug }),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      writeRecord(record);
      return record;
    },
    inviteGroupBot(input) {
      const channel = readRecord(input.channelId);
      const targetDm = readRecord(input.targetDmChannelId);
      if (
        channel?.type !== 'group' ||
        channel.ownerBotSlug !== input.inviterBotSlug ||
        !channel.members.includes(input.inviterBotSlug)
      )
        throw new Error('Only the Bot Group owner may invite');
      if (
        !isValidSlug(input.targetBotSlug) ||
        input.targetBotSlug === input.inviterBotSlug ||
        channel.members.includes(input.targetBotSlug) ||
        targetDm?.type !== 'dm' ||
        targetDm.botSlug !== input.targetBotSlug
      )
        throw new Error('Group invite target is unavailable or already a member');
      const existing = channel.invitations?.find(
        (item) => item.targetBotSlug === input.targetBotSlug && item.status === 'pending',
      );
      if (existing !== undefined) return existing;
      const timestamp = now().toISOString();
      const invitation: GroupInvitation = {
        id: 'group-invite-' + randomUUID(),
        targetBotSlug: input.targetBotSlug,
        targetBotCreatedAt: input.targetBotCreatedAt,
        inviterBotSlug: input.inviterBotSlug,
        status: 'pending',
        createdAt: timestamp,
      };
      const next = {
        ...channel,
        invitations: [...(channel.invitations ?? []), invitation],
        updatedAt: timestamp,
      };
      const body =
        'PersonaBot ' +
        input.inviterBotSlug +
        ' invites you to Group Channel ' +
        channel.name +
        ' (' +
        channel.id +
        '). Invitation ID: ' +
        invitation.id +
        '. Call group_invite_respond with this ID and accept true or false. ' +
        'You cannot read or send in the Group until you accept.';
      database.transaction(
        (db) => {
          db.prepare('UPDATE channel_records SET record_json = ? WHERE channel_id = ?').run(
            JSON.stringify(next),
            channel.id,
          );
          const sourceEventId = randomUUID();
          db.prepare(`
            INSERT INTO source_events (
              source_event_id, source_kind, bot_slug, channel_id, message_id,
              body, created_at, payload_json
            ) VALUES (?, 'system-message', ?, ?, ?, ?, ?, ?)
          `).run(
            sourceEventId,
            input.targetBotSlug,
            targetDm.id,
            invitation.id,
            body,
            timestamp,
            JSON.stringify({
              groupInvitation: { channelId: channel.id, invitationId: invitation.id },
              ...(input.botCausation === undefined ? {} : { botCausation: input.botCausation }),
            }),
          );
          db.prepare(`
            INSERT INTO inbox_admissions (source_event_id, bot_slug, reason)
            VALUES (?, ?, 'group-invite')
          `).run(sourceEventId, input.targetBotSlug);
        },
        ['channel', 'source-event', 'bot-inbox'],
      );
      publishRecordChanged();
      return invitation;
    },
    respondToGroupInvite(input) {
      const channel = this.list().find(
        (candidate) =>
          candidate.type === 'group' &&
          candidate.invitations?.some((item) => item.id === input.invitationId),
      );
      const invitation = channel?.invitations?.find((item) => item.id === input.invitationId);
      if (
        channel?.type !== 'group' ||
        invitation === undefined ||
        invitation.targetBotSlug !== input.targetBotSlug ||
        invitation.targetBotCreatedAt !== input.targetBotCreatedAt
      )
        throw new Error('Group invitation is unavailable to this PersonaBot');
      const expectedStatus = input.accept ? 'accepted' : 'declined';
      if (invitation.status === expectedStatus) {
        if (!input.accept || channel.members.includes(input.targetBotSlug))
          return { channel, invitation };
      }
      if (
        invitation.status !== 'pending' ||
        channel.ownerBotSlug !== invitation.inviterBotSlug ||
        !channel.members.includes(invitation.inviterBotSlug) ||
        channel.members.includes(input.targetBotSlug)
      )
        throw new Error('Group invitation is no longer pending');
      const decided: GroupInvitation = {
        ...invitation,
        status: expectedStatus,
        respondedAt: now().toISOString(),
      };
      const updated: ChannelRecord = {
        ...channel,
        members: input.accept ? [...channel.members, input.targetBotSlug] : channel.members,
        invitations: (channel.invitations ?? []).map((item) =>
          item.id === input.invitationId ? decided : item,
        ),
        updatedAt: decided.respondedAt!,
      };
      writeRecord(updated);
      return { channel: updated, invitation: decided };
    },
    requestGroupJoin(input) {
      const channel = readRecord(input.channelId);
      const ownerDm =
        input.ownerDmChannelId === undefined ? undefined : readRecord(input.ownerDmChannelId);
      if (
        channel?.type !== 'group' ||
        channel.members.includes(input.requesterBotSlug) ||
        (input.ownerDmChannelId !== undefined &&
          (ownerDm?.type !== 'dm' || ownerDm.botSlug !== channel.ownerBotSlug))
      )
        throw new Error('Group join target is unavailable or requester is already a member');
      const pending = channel.joinRequests?.find(
        (item) =>
          item.requesterBotSlug === input.requesterBotSlug &&
          item.requesterBotCreatedAt === input.requesterBotCreatedAt &&
          item.status === 'pending',
      );
      if (pending !== undefined) return pending;
      const timestamp = now().toISOString();
      const request: GroupJoinRequest = {
        id: 'group-join-' + randomUUID(),
        requesterBotSlug: input.requesterBotSlug,
        requesterBotCreatedAt: input.requesterBotCreatedAt,
        status: 'pending',
        createdAt: timestamp,
      };
      const updated: ChannelRecord = {
        ...channel,
        joinRequests: [...(channel.joinRequests ?? []), request],
        updatedAt: timestamp,
      };
      database.transaction(
        (db) => {
          db.prepare('UPDATE channel_records SET record_json = ? WHERE channel_id = ?').run(
            JSON.stringify(updated),
            channel.id,
          );
          if (ownerDm !== undefined && channel.ownerBotSlug !== undefined) {
            const body =
              'PersonaBot ' +
              input.requesterBotSlug +
              ' requests to join your Group Channel ' +
              channel.name +
              ' (' +
              channel.id +
              '). Request ID: ' +
              request.id +
              '. Use group_join_decide with the request ID and accept true or false.';
            const sourceEventId = randomUUID();
            db.prepare(`
              INSERT INTO source_events (
                source_event_id, source_kind, bot_slug, channel_id, message_id,
                body, created_at, payload_json
              ) VALUES (?, 'system-message', ?, ?, ?, ?, ?, ?)
            `).run(
              sourceEventId,
              channel.ownerBotSlug,
              ownerDm.id,
              request.id,
              body,
              timestamp,
              JSON.stringify({
                groupJoinRequest: { channelId: channel.id, requestId: request.id },
                ...(input.botCausation === undefined ? {} : { botCausation: input.botCausation }),
              }),
            );
            db.prepare(`
              INSERT INTO inbox_admissions (source_event_id, bot_slug, reason)
              VALUES (?, ?, 'group-join-request')
            `).run(sourceEventId, channel.ownerBotSlug);
          }
        },
        ['channel', 'source-event', 'bot-inbox'],
      );
      publishRecordChanged();
      return request;
    },
    decideGroupJoin(input) {
      const channel = readRecord(input.channelId);
      const request = channel?.joinRequests?.find((item) => item.id === input.requestId);
      const dm = readRecord(input.requesterDmChannelId);
      if (
        channel?.type !== 'group' ||
        request === undefined ||
        request.requesterBotCreatedAt !== input.requesterBotCreatedAt ||
        dm?.type !== 'dm' ||
        dm.botSlug !== request.requesterBotSlug ||
        (input.decidedBy !== 'human' &&
          (channel.ownerBotSlug !== input.decidedBy || !channel.members.includes(input.decidedBy)))
      )
        throw new Error('Group join request is unavailable to this actor');
      const status = input.accept ? 'accepted' : 'declined';
      if (request.status === status) return { channel, request, notified: false };
      if (request.status !== 'pending' || channel.members.includes(request.requesterBotSlug))
        throw new Error('Group join request is no longer pending');
      const timestamp = now().toISOString();
      const decided: GroupJoinRequest = {
        ...request,
        status,
        decidedAt: timestamp,
        decidedBy: input.decidedBy,
      };
      const updated: ChannelRecord = {
        ...channel,
        members: input.accept ? [...channel.members, request.requesterBotSlug] : channel.members,
        joinRequests: (channel.joinRequests ?? []).map((item) =>
          item.id === request.id ? decided : item,
        ),
        updatedAt: timestamp,
      };
      const body =
        'Your request to join Group Channel ' +
        channel.name +
        ' (' +
        channel.id +
        ') was ' +
        status +
        '. ' +
        (input.accept
          ? 'You may now use channel_read and channel_send there.'
          : 'You are not a member of that Group.');
      database.transaction(
        (db) => {
          db.prepare('UPDATE channel_records SET record_json = ? WHERE channel_id = ?').run(
            JSON.stringify(updated),
            channel.id,
          );
          const sourceEventId = randomUUID();
          db.prepare(`
            INSERT INTO source_events (
              source_event_id, source_kind, bot_slug, channel_id, message_id,
              body, created_at, payload_json
            ) VALUES (?, 'system-message', ?, ?, ?, ?, ?, ?)
          `).run(
            sourceEventId,
            request.requesterBotSlug,
            dm.id,
            'group-join-decision-' + request.id,
            body,
            timestamp,
            JSON.stringify({
              groupJoinDecision: { channelId: channel.id, requestId: request.id, status },
              ...(input.botCausation === undefined ? {} : { botCausation: input.botCausation }),
            }),
          );
          db.prepare(`
            INSERT INTO inbox_admissions (source_event_id, bot_slug, reason)
            VALUES (?, ?, 'group-join-decision')
          `).run(sourceEventId, request.requesterBotSlug);
          db.prepare(`
            UPDATE inbox_admissions
               SET attempt_state = 'handled', handled_at = ?
             WHERE reason = 'group-join-request'
               AND source_event_id IN (
                 SELECT source_event_id FROM source_events WHERE message_id = ?
               ) AND attempt_state IN ('pending', 'retryable')
          `).run(timestamp, request.id);
        },
        ['channel', 'source-event', 'bot-inbox'],
      );
      publishRecordChanged();
      return { channel: updated, request: decided, notified: true };
    },
    cancelGroupInvite(channelId, invitationId) {
      const channel = readRecord(channelId);
      const invitation = channel?.invitations?.find((item) => item.id === invitationId);
      if (channel?.type !== 'group' || invitation === undefined || invitation.status !== 'pending')
        throw new Error('Pending Group invitation not found');
      const updated: ChannelRecord = {
        ...channel,
        invitations: (channel.invitations ?? []).map((item) =>
          item.id === invitationId
            ? { ...item, status: 'cancelled', respondedAt: now().toISOString() }
            : item,
        ),
        updatedAt: now().toISOString(),
      };
      database.transaction(
        (db) => {
          db.prepare('UPDATE channel_records SET record_json = ? WHERE channel_id = ?').run(
            JSON.stringify(updated),
            channelId,
          );
          db.prepare(`
            UPDATE inbox_admissions
               SET attempt_state = 'handled', handled_at = ?
             WHERE source_event_id IN (
               SELECT source_event_id FROM source_events WHERE message_id = ?
             ) AND reason = 'group-invite' AND attempt_state IN ('pending', 'retryable')
          `).run(now().toISOString(), invitationId);
        },
        ['channel', 'bot-inbox'],
      );
      publishRecordChanged();
      return updated;
    },
    cancelInvitationsForBot(botSlug) {
      for (const channel of this.list()) {
        if (channel.type !== 'group') continue;
        for (const invitation of channel.invitations ?? []) {
          if (invitation.targetBotSlug === botSlug && invitation.status === 'pending')
            this.cancelGroupInvite(channel.id, invitation.id);
        }
        const current = readRecord(channel.id);
        const pending = (current?.joinRequests ?? []).filter(
          (request) => request.requesterBotSlug === botSlug && request.status === 'pending',
        );
        if (pending.length > 0 && current?.type === 'group') {
          const timestamp = now().toISOString();
          const updated: ChannelRecord = {
            ...current,
            joinRequests: (current.joinRequests ?? []).map((request) =>
              pending.some((item) => item.id === request.id)
                ? { ...request, status: 'cancelled', decidedAt: timestamp }
                : request,
            ),
            updatedAt: timestamp,
          };
          database.transaction(
            (db) => {
              db.prepare('UPDATE channel_records SET record_json = ? WHERE channel_id = ?').run(
                JSON.stringify(updated),
                channel.id,
              );
              for (const request of pending)
                db.prepare(`
                UPDATE inbox_admissions SET attempt_state = 'handled', handled_at = ?
                 WHERE reason = 'group-join-request' AND attempt_state IN ('pending', 'retryable')
                   AND source_event_id IN (
                     SELECT source_event_id FROM source_events WHERE message_id = ?
                   )
              `).run(timestamp, request.id);
            },
            ['channel', 'bot-inbox'],
          );
          publishRecordChanged();
        }
      }
      database.transaction(
        (db) =>
          db
            .prepare(`
          UPDATE inbox_admissions
             SET attempt_state = 'handled', handled_at = ?
           WHERE bot_slug = ? AND reason = 'group-join-decision'
             AND attempt_state IN ('pending', 'retryable')
        `)
            .run(now().toISOString(), botSlug),
        ['bot-inbox'],
      );
    },
    setGroupWakePolicy(channelId, botSlug, policy) {
      const channel = readRecord(channelId);
      if (channel?.type !== 'group' || !channel.members.includes(botSlug))
        throw new Error('Group member not found');
      if (
        (policy.mode !== 'mentions' && policy.mode !== 'digest') ||
        !Number.isSafeInteger(policy.count) ||
        policy.count < 1 ||
        policy.count > 100 ||
        !Number.isSafeInteger(policy.intervalSeconds) ||
        policy.intervalSeconds < 1 ||
        policy.intervalSeconds > 3600
      )
        throw new Error('Invalid Group wake policy');
      const previous = channel.wakePolicies?.[botSlug];
      if (
        previous?.mode === policy.mode &&
        previous.count === policy.count &&
        previous.intervalSeconds === policy.intervalSeconds
      )
        return channel;
      const updated: ChannelRecord = {
        ...channel,
        wakePolicies: {
          ...channel.wakePolicies,
          [botSlug]: { ...policy, revision: (previous?.revision ?? 0) + 1 },
        },
        updatedAt: now().toISOString(),
      };
      writeRecord(updated);
      return updated;
    },
    removeGroupMember(channelId, botSlug) {
      const channel = readRecord(channelId);
      if (channel?.type !== 'group' || !channel.members.includes(botSlug))
        throw new Error('Group member not found');
      const timestamp = now().toISOString();
      const updated: ChannelRecord = {
        ...channel,
        members: channel.members.filter((item) => item !== botSlug),
        invitations: (channel.invitations ?? []).map((item) =>
          item.status === 'pending' && item.inviterBotSlug === botSlug
            ? { ...item, status: 'cancelled', respondedAt: timestamp }
            : item,
        ),
        updatedAt: timestamp,
      };
      if (channel.ownerBotSlug === botSlug) delete updated.ownerBotSlug;
      if (updated.wakePolicies !== undefined) {
        updated.wakePolicies = { ...updated.wakePolicies };
        delete updated.wakePolicies[botSlug];
      }
      const cancelled = (channel.invitations ?? []).filter(
        (item) => item.status === 'pending' && item.inviterBotSlug === botSlug,
      );
      database.transaction(
        (db) => {
          db.prepare('UPDATE channel_records SET record_json = ? WHERE channel_id = ?').run(
            JSON.stringify(updated),
            channelId,
          );
          for (const invitation of cancelled)
            db.prepare(`
              UPDATE inbox_admissions
                 SET attempt_state = 'handled', handled_at = ?
               WHERE source_event_id IN (
                 SELECT source_event_id FROM source_events WHERE message_id = ?
               ) AND reason = 'group-invite' AND attempt_state IN ('pending', 'retryable')
            `).run(timestamp, invitation.id);
          db.prepare(`
            UPDATE inbox_admissions
               SET attempt_state = 'needs-repair', last_error = 'Group membership revoked'
             WHERE bot_slug = ? AND reason = 'group-ordinary'
               AND attempt_state IN ('pending', 'retryable')
               AND source_event_id IN (
                 SELECT source_event_id FROM source_events WHERE channel_id = ?
               )
          `).run(botSlug, channelId);
        },
        ['channel', 'bot-inbox'],
      );
      publishRecordChanged();
      return updated;
    },
    deleteGroup(channelId) {
      const channel = readRecord(channelId);
      if (channel?.type !== 'group') throw new Error('Group Channel not found');
      const timestamp = now().toISOString();
      const deleted: ChannelRecord = {
        ...channel,
        members: [],
        invitations: (channel.invitations ?? []).map((item) =>
          item.status === 'pending'
            ? { ...item, status: 'cancelled', respondedAt: timestamp }
            : item,
        ),
        joinRequests: (channel.joinRequests ?? []).map((item) =>
          item.status === 'pending'
            ? { ...item, status: 'cancelled', decidedAt: timestamp, decidedBy: 'human' }
            : item,
        ),
        deletedAt: timestamp,
        updatedAt: timestamp,
      };
      delete deleted.ownerBotSlug;
      delete deleted.wakePolicies;
      database.transaction(
        (db) => {
          db.prepare('UPDATE channel_records SET record_json = ? WHERE channel_id = ?').run(
            JSON.stringify(deleted),
            channelId,
          );
          db.prepare(`
            UPDATE inbox_admissions SET attempt_state = 'needs-repair',
              last_error = 'Group Channel deleted by Human'
             WHERE source_event_id IN (
               SELECT source_event_id FROM source_events WHERE channel_id = ?
             ) AND attempt_state IN ('pending', 'retryable')
          `).run(channelId);
          for (const invitation of channel.invitations ?? [])
            db.prepare(`
              UPDATE inbox_admissions
                 SET attempt_state = 'handled', handled_at = ?
               WHERE source_event_id IN (
                 SELECT source_event_id FROM source_events WHERE message_id = ?
               ) AND reason = 'group-invite'
                 AND attempt_state IN ('pending', 'retryable')
            `).run(timestamp, invitation.id);
          for (const request of channel.joinRequests ?? [])
            db.prepare(`
              UPDATE inbox_admissions
                 SET attempt_state = 'handled', handled_at = ?
               WHERE source_event_id IN (
                 SELECT source_event_id FROM source_events WHERE message_id = ?
               ) AND reason = 'group-join-request'
                 AND attempt_state IN ('pending', 'retryable')
            `).run(timestamp, request.id);
        },
        ['channel', 'bot-inbox'],
      );
      publishRecordChanged();
    },
    rename(id, name) {
      const prior = readRecord(id);
      if (prior === undefined || !name.trim()) return undefined;
      const updated = { ...prior, name: name.trim() };
      writeRecord(updated);
      return updated;
    },
    latestMessage(id) {
      return allMessages(id).at(-1);
    },
    hasMessage(id, messageId) {
      return allMessages(id).some((message) => message.id === messageId);
    },
    message(id, messageId) {
      const messages = allMessages(id);
      const found = messages.find((item) => item.id === messageId);
      return found === undefined ? undefined : project(messages, found);
    },
    assertAttachmentRefs,
    referencedAttachmentHashes() {
      const hashes = new Set<string>();
      for (const channel of this.list())
        for (const message of allMessages(channel.id))
          for (const ref of message.attachments ?? []) hashes.add(ref.hash);
      return hashes;
    },
    readPosition(id) {
      const row = database.read((db) =>
        db
          .prepare(`
        SELECT message_id, revision, read_at FROM channel_read_positions WHERE channel_id = ?
      `)
          .get(id),
      ) as { message_id: string; revision: number; read_at: string } | undefined;
      return row === undefined
        ? undefined
        : {
            messageId: row.message_id,
            revision: row.revision,
            readAt: row.read_at,
          };
    },
    async markRead(id, messageId) {
      const index = allMessages(id).findIndex((message) => message.id === messageId);
      if (index < 0) return undefined;
      const previous = this.readPosition(id);
      if (previous !== undefined && previous.revision >= index + 1) return previous;
      const position = { messageId, revision: index + 1, readAt: now().toISOString() };
      database.transaction(
        (db) =>
          db
            .prepare(`
        INSERT INTO channel_read_positions (channel_id, message_id, revision, read_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(channel_id) DO UPDATE SET
          message_id = excluded.message_id, revision = excluded.revision, read_at = excluded.read_at
      `)
            .run(id, messageId, position.revision, position.readAt),
        ['channel'],
      );
      return position;
    },
    async appendMessage(id, message) {
      const result = append(id, message, false);
      return result?.status === 'appended' ? result.message : undefined;
    },
    async appendMessageOnce(id, message) {
      const result = append(id, message, true);
      return result ?? { status: 'missing' };
    },
    readMessages(id, readOptions) {
      const messages = allMessages(id);
      const limit = Math.max(
        1,
        Math.min(readOptions?.limit ?? DEFAULT_MESSAGE_PAGE, MAX_MESSAGE_PAGE),
      );
      const end =
        readOptions?.before === undefined
          ? messages.length
          : messages.findIndex((message) => message.id === readOptions.before);
      if (end < 0) return [];
      return messages
        .slice(Math.max(0, end - limit), end)
        .reverse()
        .map((message) => project(messages, message));
    },
    queryMessages(id, queryOptions) {
      const query = prepareChannelMessageQuery(id, queryOptions);
      if (!isValidChannelId(id)) return { messages: [] };
      let before: { revision: number; at: string; message_id: string } | undefined;
      if (query.beforeId !== undefined) {
        const beforeId = query.beforeId;
        before = database.read((db) =>
          db
            .prepare(`
              SELECT p.revision, e.created_at AS at, p.message_id
                FROM channel_placements p
                JOIN source_events e ON e.source_event_id = p.source_event_id
               WHERE p.channel_id = ? AND p.message_id = ?
            `)
            .get(id, beforeId),
        ) as typeof before;
        if (before === undefined) throw new Error('channel_read: invalid cursor');
      }
      const where = ['p.channel_id = ?'];
      const values: Array<string | number> = [id];
      if (before !== undefined) {
        if (query.orderBy === 'time') {
          where.push(
            '(julianday(e.created_at) < julianday(?) OR (julianday(e.created_at) = julianday(?) AND p.message_id < ?))',
          );
          values.push(before.at, before.at, before.message_id);
        } else {
          where.push('p.revision < ?');
          values.push(before.revision);
        }
      }
      if (query.orderBy === 'time') where.push('julianday(e.created_at) IS NOT NULL');
      if (query.text !== undefined && query.text.length > 0) {
        where.push('instr(botharness_unicode_lower(e.body), ?) > 0');
        values.push(query.text);
      }
      if (query.authorBotId !== undefined) {
        where.push("json_extract(e.payload_json, '$.author.kind') = 'bot'");
        where.push("json_extract(e.payload_json, '$.author.slug') = ?");
        values.push(query.authorBotId);
      }
      if (query.authorKind !== undefined) {
        where.push("json_extract(e.payload_json, '$.author.kind') = ?");
        values.push(query.authorKind);
      }
      if (query.from !== undefined) {
        where.push('julianday(e.created_at) >= ?');
        values.push(query.from / 86_400_000 + 2_440_587.5);
      }
      if (query.to !== undefined) {
        where.push('julianday(e.created_at) <= ?');
        values.push(query.to / 86_400_000 + 2_440_587.5);
      }
      const rows = database.read((db) => {
        if (!lowerRegistered) {
          db.function('botharness_unicode_lower', { deterministic: true }, (value: unknown) =>
            typeof value === 'string' ? value.toLowerCase() : '',
          );
          lowerRegistered = true;
        }
        return db
          .prepare(`
          SELECT p.source_event_id, e.payload_json, e.body
            FROM channel_placements p
            JOIN source_events e ON e.source_event_id = p.source_event_id
           WHERE ${where.join(' AND ')}
           ORDER BY ${query.orderBy === 'time' ? 'julianday(e.created_at) DESC, p.message_id DESC' : 'p.revision DESC'} LIMIT ?
        `)
          .all(...values, query.limit + 1);
      }) as unknown as PlacementRow[];
      const selected = rows.slice(0, query.limit).flatMap((row) => {
        const message = parseMessage(row.payload_json, row.body);
        if (message === undefined) return [];
        const deliveries = admissionStatuses(row.source_event_id);
        return [{ ...message, ...(deliveries === undefined ? {} : { deliveries }) }];
      });
      const replyIds = [
        ...new Set(
          selected.flatMap((message) => (message.replyTo === undefined ? [] : [message.replyTo])),
        ),
      ];
      const byId = new Map<string, ChannelMessage>();
      if (replyIds.length > 0) {
        const placeholders = replyIds.map(() => '?').join(', ');
        const replies = database.read((db) =>
          db
            .prepare(`
            SELECT e.payload_json, e.body
              FROM channel_placements p
              JOIN source_events e ON e.source_event_id = p.source_event_id
             WHERE p.channel_id = ? AND p.message_id IN (${placeholders})
          `)
            .all(id, ...replyIds),
        ) as unknown as Array<Pick<PlacementRow, 'payload_json' | 'body'>>;
        for (const row of replies) {
          const message = parseMessage(row.payload_json, row.body);
          if (message !== undefined) byId.set(message.id, message);
        }
      }
      const last = selected.at(-1);
      return {
        messages: selected.map((message) => replyProjection(message, byId)),
        ...(rows.length <= query.limit || last === undefined
          ? {}
          : {
              nextCursor: Buffer.from(
                JSON.stringify({ beforeId: last.id, filter: query.filter }),
              ).toString('base64url'),
            }),
      };
    },
    readTimeline(id, request) {
      const messages = allMessages(id);
      const page = pageChannelTimeline(id, messages, request);
      return page === undefined
        ? undefined
        : {
            ...page,
            entries: page.entries.map((message) => project(messages, message)),
          };
    },
    revision: revisionOf,
    admissionChanged(channelId, messageId) {
      const message = this.message(channelId, messageId);
      if (message !== undefined) options.onAdmissionChanged?.(channelId, messageId, message);
    },
    messagesAfter(id, revision) {
      if (!isValidChannelId(id) || !Number.isSafeInteger(revision) || revision < 0)
        return undefined;
      const messages = allMessages(id);
      if (revision > messages.length) return undefined;
      return messages.slice(revision).map((message, index) => ({
        channelId: id,
        message: project(messages, message),
        revision: revision + index + 1,
      }));
    },
  };
}
