import { randomUUID } from 'node:crypto';

import type { ChannelMessage, ChannelRecord } from '../channels/channel.js';
import type { ChannelStore } from '../channels/store.js';
import type {
  CreatePersonaBotResult,
  PersonaBotPatch,
  PersonaBotRecord,
} from '../bots/persona-bot.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import { isValidSlug } from '../bots/slug.js';
import {
  isInsideWorkspace,
  type BotSessionSource,
  type SessionSummary,
} from '../sessions/source.js';
import type {
  AggregatedState,
  BotStateSnapshot,
  BotStateTracker,
  SessionState,
} from '../state/bot-state.js';

export interface PersonaBotSummary {
  slug: string;
  displayName: string;
  tag?: string;
  description?: string;
  avatar?: string;
  paused?: boolean;
  aggregateState: AggregatedState;
  workspaces: string[];
  createdAt: string;
}

export interface PersonaBotDetail extends PersonaBotSummary {
  model?: string;
  preset?: string;
  memoryDir?: string;
  sessions: Record<string, SessionState>;
}

export interface BridgeError {
  code: string;
  message: string;
}

export type BridgeResult<T> = { ok: true; value: T } | { ok: false; error: BridgeError };

export interface BridgeMethods {
  list(payload: unknown): BridgeResult<{ bots: PersonaBotSummary[] }>;
  get(payload: unknown): BridgeResult<{ bot: PersonaBotDetail }>;
  create(payload: unknown): BridgeResult<{ bot: PersonaBotDetail }>;
  update(payload: unknown): BridgeResult<{ bot: PersonaBotDetail }>;
  pause(payload: unknown): BridgeResult<{ bot: PersonaBotDetail }>;
  resume(payload: unknown): BridgeResult<{ bot: PersonaBotDetail }>;
  channels(payload: unknown): BridgeResult<{ channels: ChannelRecord[] }>;
  channelDm(payload: unknown): BridgeResult<{ channel: ChannelRecord }>;
  channelCreate(payload: unknown): BridgeResult<{ channel: ChannelRecord }>;
  channelMessages(payload: unknown): BridgeResult<{ messages: ChannelMessage[] }>;
  channelSend(payload: unknown): Promise<BridgeResult<{ message: ChannelMessage }>>;
  sessions(payload: unknown): BridgeResult<{ sessions: SessionSummary[] }>;
}

export interface BridgeMethodsDeps {
  registry: PersonaBotRegistry;
  states: BotStateTracker;
  channels: ChannelStore;
  sessions: BotSessionSource;
}

type ParsedField<T> = { ok: true; value: T | undefined } | { ok: false };

function asObject(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>)
    : {};
}

function asQuery(payload: unknown): string | undefined {
  const value = asObject(payload)['query'];
  return typeof value === 'string' ? value : undefined;
}

function asSlug(payload: unknown): string | undefined {
  const value = asObject(payload)['slug'];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function parseOptional(source: Record<string, unknown>, key: string): ParsedField<string> {
  const value = source[key];
  if (value === undefined) return { ok: true, value: undefined };
  return typeof value === 'string' ? { ok: true, value } : { ok: false };
}

function parseWorkspaces(source: Record<string, unknown>): ParsedField<string[]> {
  const value = source['workspaces'];
  if (value === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    return { ok: false };
  }
  return { ok: true, value: [...value] };
}

function invalidInput(message: string): BridgeResult<never> {
  return { ok: false, error: { code: 'invalid-input', message } };
}

function unknownBot(slug: string): BridgeResult<never> {
  return { ok: false, error: { code: 'not-found', message: `unknown PersonaBot: ${slug}` } };
}

function unknownChannel(id: string): BridgeResult<never> {
  return { ok: false, error: { code: 'not-found', message: `unknown Channel: ${id}` } };
}

function asNonBlank(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function createFailure(
  slug: string,
  reason: Extract<CreatePersonaBotResult, { ok: false }>['reason'],
): BridgeResult<never> {
  switch (reason) {
    case 'duplicate':
      return {
        ok: false,
        error: { code: 'duplicate', message: `PersonaBot already exists: ${slug}` },
      };
    case 'invalid-slug':
      return { ok: false, error: { code: 'invalid-slug', message: `invalid slug: ${slug}` } };
    case 'invalid-memory-dir':
      return invalidInput('memoryDir must be an absolute path');
  }
}

function summarize(record: PersonaBotRecord, snapshot: BotStateSnapshot): PersonaBotSummary {
  return {
    slug: record.slug,
    displayName: record.displayName,
    aggregateState: snapshot.state,
    workspaces: [...record.workspaces],
    createdAt: record.createdAt,
    ...(record.tag === undefined ? {} : { tag: record.tag }),
    ...(record.description === undefined ? {} : { description: record.description }),
    ...(record.avatar === undefined ? {} : { avatar: record.avatar }),
    ...(record.paused === undefined ? {} : { paused: record.paused }),
  };
}

function detail(record: PersonaBotRecord, snapshot: BotStateSnapshot): PersonaBotDetail {
  return {
    ...summarize(record, snapshot),
    sessions: { ...snapshot.sessions },
    ...(record.model === undefined ? {} : { model: record.model }),
    ...(record.preset === undefined ? {} : { preset: record.preset }),
    ...(record.memoryDir === undefined ? {} : { memoryDir: record.memoryDir }),
  };
}

export function createBridgeMethods(deps: BridgeMethodsDeps): BridgeMethods {
  const detailOf = (record: PersonaBotRecord): { bot: PersonaBotDetail } => ({
    bot: detail(record, deps.states.snapshot(record.slug)),
  });

  const setPaused = (
    payload: unknown,
    paused: boolean,
  ): BridgeResult<{ bot: PersonaBotDetail }> => {
    const slug = asSlug(payload);
    if (slug === undefined) return invalidInput('slug is required');
    const result = deps.registry.setPaused(slug, paused);
    if (!result.ok) return unknownBot(slug);
    return { ok: true, value: detailOf(result.record) };
  };

  return {
    list(payload) {
      const query = asQuery(payload)?.trim().toLowerCase();
      const bots = deps.registry
        .list()
        .filter((record) => {
          if (query === undefined || query.length === 0) return true;
          return (
            record.slug.toLowerCase().includes(query) ||
            record.displayName.toLowerCase().includes(query)
          );
        })
        .map((record) => summarize(record, deps.states.snapshot(record.slug)));
      return { ok: true, value: { bots } };
    },
    get(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) {
        return invalidInput('slug is required');
      }
      const record = deps.registry.get(slug);
      if (record === undefined) return unknownBot(slug);
      return { ok: true, value: detailOf(record) };
    },
    create(payload) {
      const source = asObject(payload);
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      const displayName = source['displayName'];
      if (typeof displayName !== 'string') return invalidInput('displayName is required');
      const persona = parseOptional(source, 'persona');
      const tag = parseOptional(source, 'tag');
      const description = parseOptional(source, 'description');
      const model = parseOptional(source, 'model');
      const preset = parseOptional(source, 'preset');
      const workspaces = parseWorkspaces(source);
      const avatarSeed = parseOptional(source, 'avatarSeed');
      if (
        !persona.ok ||
        !tag.ok ||
        !description.ok ||
        !model.ok ||
        !preset.ok ||
        !workspaces.ok ||
        !avatarSeed.ok
      ) {
        return invalidInput('invalid create payload');
      }
      const result = deps.registry.create({
        slug,
        displayName,
        ...(persona.value === undefined ? {} : { persona: persona.value }),
        ...(tag.value === undefined ? {} : { tag: tag.value }),
        ...(description.value === undefined ? {} : { description: description.value }),
        ...(model.value === undefined ? {} : { model: model.value }),
        ...(preset.value === undefined ? {} : { preset: preset.value }),
        ...(workspaces.value === undefined ? {} : { workspaces: workspaces.value }),
        ...(avatarSeed.value === undefined ? {} : { avatar: avatarSeed.value }),
      });
      if (!result.ok) return createFailure(slug, result.reason);
      return { ok: true, value: detailOf(result.record) };
    },
    update(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      const patchOrUndefined = asObject(payload)['patch'];
      if (typeof patchOrUndefined !== 'object' || patchOrUndefined === null) {
        return invalidInput('patch is required');
      }
      const source = patchOrUndefined as Record<string, unknown>;
      const displayName = parseOptional(source, 'displayName');
      const tag = parseOptional(source, 'tag');
      const description = parseOptional(source, 'description');
      const model = parseOptional(source, 'model');
      const preset = parseOptional(source, 'preset');
      const workspaces = parseWorkspaces(source);
      const avatarSeed = parseOptional(source, 'avatarSeed');
      if (
        !displayName.ok ||
        !tag.ok ||
        !description.ok ||
        !model.ok ||
        !preset.ok ||
        !workspaces.ok ||
        !avatarSeed.ok
      ) {
        return invalidInput('invalid update payload');
      }
      const patch: PersonaBotPatch = {
        ...(displayName.value === undefined ? {} : { displayName: displayName.value }),
        ...(tag.value === undefined ? {} : { tag: tag.value }),
        ...(description.value === undefined ? {} : { description: description.value }),
        ...(model.value === undefined ? {} : { model: model.value }),
        ...(preset.value === undefined ? {} : { preset: preset.value }),
        ...(workspaces.value === undefined ? {} : { workspaces: workspaces.value }),
        ...(avatarSeed.value === undefined ? {} : { avatar: avatarSeed.value }),
      };
      const result = deps.registry.update(slug, patch);
      if (!result.ok) {
        return result.reason === 'not-found'
          ? unknownBot(slug)
          : invalidInput('invalid update payload');
      }
      return { ok: true, value: detailOf(result.record) };
    },
    pause(payload) {
      return setPaused(payload, true);
    },
    resume(payload) {
      return setPaused(payload, false);
    },
    channels() {
      return { ok: true, value: { channels: deps.channels.list() } };
    },
    channelDm(payload) {
      const source = asObject(payload);
      const slug = asNonBlank(source, 'slug');
      if (slug === undefined) return invalidInput('slug is required');
      if (!isValidSlug(slug)) return invalidInput(`invalid slug: ${slug}`);
      const displayName = parseOptional(source, 'displayName');
      if (!displayName.ok) return invalidInput('invalid channelDm payload');
      const channel = deps.channels.getOrCreateDm(slug, displayName.value ?? slug);
      if (channel === undefined) return invalidInput(`invalid slug: ${slug}`);
      return { ok: true, value: { channel } };
    },
    channelCreate(payload) {
      const source = asObject(payload);
      const name = asNonBlank(source, 'name');
      if (name === undefined) return invalidInput('name is required');
      const members = source['members'];
      if (
        !Array.isArray(members) ||
        !members.every((entry) => typeof entry === 'string' && entry.trim().length > 0)
      ) {
        return invalidInput('members must be an array of bot slugs');
      }
      const channel = deps.channels.createGroup({ name, members: [...members] });
      return { ok: true, value: { channel } };
    },
    channelMessages(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      if (channelId === undefined) return invalidInput('channelId is required');
      if (deps.channels.get(channelId) === undefined) return unknownChannel(channelId);
      const before = parseOptional(source, 'before');
      if (!before.ok) return invalidInput('invalid channelMessages payload');
      const limitValue = source['limit'];
      let limit: number | undefined;
      if (limitValue !== undefined) {
        if (typeof limitValue !== 'number' || !Number.isInteger(limitValue) || limitValue < 1) {
          return invalidInput('limit must be a positive integer');
        }
        limit = limitValue;
      }
      const cursor = before.value?.trim();
      const messages = deps.channels.readMessages(channelId, {
        ...(cursor === undefined || cursor.length === 0 ? {} : { before: cursor }),
        ...(limit === undefined ? {} : { limit }),
      });
      return { ok: true, value: { messages } };
    },
    async channelSend(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      if (channelId === undefined) return invalidInput('channelId is required');
      const body = source['body'];
      if (typeof body !== 'string' || body.trim().length === 0) {
        return invalidInput('body is required');
      }
      const message: ChannelMessage = {
        id: randomUUID(),
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body,
      };
      const appended = await deps.channels.appendMessage(channelId, message);
      if (appended === undefined) return unknownChannel(channelId);
      return { ok: true, value: { message: appended } };
    },
    sessions(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      const record = deps.registry.get(slug);
      if (record === undefined) return unknownBot(slug);
      const workspaces = record.workspaces;
      const sessions = deps.sessions
        .list()
        .filter((session) =>
          workspaces.some((workspace) => isInsideWorkspace(session.cwd, workspace)),
        )
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      return { ok: true, value: { sessions } };
    },
  };
}
