import type {
  CreatePersonaBotResult,
  PersonaBotPatch,
  PersonaBotRecord,
} from '../bots/persona-bot.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
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
}

export interface BridgeMethodsDeps {
  registry: PersonaBotRegistry;
  states: BotStateTracker;
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
  };
}
