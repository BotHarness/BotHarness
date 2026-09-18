import type { PersonaBotRecord } from '../bots/persona-bot.js';
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
}

export interface BridgeMethodsDeps {
  registry: PersonaBotRegistry;
  states: BotStateTracker;
}

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
        return { ok: false, error: { code: 'invalid-input', message: 'slug is required' } };
      }
      const record = deps.registry.get(slug);
      if (record === undefined) {
        return { ok: false, error: { code: 'not-found', message: `unknown PersonaBot: ${slug}` } };
      }
      return { ok: true, value: { bot: detail(record, deps.states.snapshot(slug)) } };
    },
  };
}
