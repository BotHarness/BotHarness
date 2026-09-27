/**
 * Human slash command `/deepseek-bot-log` (issue #252): a Session-composer
 * entry that runs the LogQuery-equivalent read server-side and renders text
 * straight to the UI — no model turn, ~0 tokens. The log skill stays
 * model-only; this command is the Human half.
 */
import { queryLogEntries, type LogEntry, type LogQuery } from './log-db.js';

/** Lowercase command name without the leading slash (DSH `CommandDefinition`). */
export const COMMAND_NAME = 'deepseek-bot-log';

/** Human-readable summary used in the discovery UI. */
export const COMMAND_DESCRIPTION =
  'Show recent BotHarness operational logs (read-only, newest first).';

/** Default UI window: small enough to render inline without scrolling. */
export const COMMAND_DEFAULT_LIMIT = 10;

/** Upper bound on one command read; the store cap stays far above this. */
export const COMMAND_MAX_LIMIT = 20;

export const COMMAND_EMPTY_TEXT = '暂无运行记录';

export interface DeepseekBotLogFilter {
  readonly plugin?: string;
  readonly limit: number;
}

/**
 * Lenient `key=value` grammar (`plugin=computer limit=5`); unknown keys and
 * malformed values are ignored so a mistyped command still answers.
 */
export function parseDeepseekBotLogInput(rawInput: string): DeepseekBotLogFilter {
  let plugin: string | undefined;
  let limit = COMMAND_DEFAULT_LIMIT;
  for (const token of rawInput.split(/\s+/)) {
    const eq = token.indexOf('=');
    if (eq <= 0) continue;
    const key = token.slice(0, eq).trim().toLowerCase();
    const value = token.slice(eq + 1).trim();
    if (value === '') continue;
    if (key === 'plugin') {
      plugin = value;
    } else if (key === 'limit') {
      const parsed = Number(value);
      if (Number.isInteger(parsed)) limit = Math.min(Math.max(parsed, 1), COMMAND_MAX_LIMIT);
    }
  }
  return plugin === undefined ? { limit } : { plugin, limit };
}

/** Newest-first `time [kind] detail` lines, or the empty-state text. */
export function formatLogEntries(entries: readonly LogEntry[]): string {
  if (entries.length === 0) return COMMAND_EMPTY_TEXT;
  return entries
    .map((entry) => `${new Date(entry.ts).toLocaleTimeString()} [${entry.kind}] ${entry.detail}`)
    .join('\n');
}

export type DeepseekBotLogCommandResult =
  | { readonly kind: 'success'; readonly text: string }
  | { readonly kind: 'error'; readonly text: string };

/**
 * Execute one command line against a profile home directory. Read-only: an
 * unreadable store answers empty, never throws, never migrates, never
 * rebuilds — a Human command must not touch the database file's lifecycle.
 */
export async function runDeepseekBotLogCommand(
  dir: string,
  rawInput: string,
): Promise<DeepseekBotLogCommandResult> {
  try {
    const filter = parseDeepseekBotLogInput(rawInput);
    const query: LogQuery = {
      ...(filter.plugin === undefined ? {} : { plugin: filter.plugin }),
      limit: filter.limit,
    };
    return { kind: 'success', text: formatLogEntries(queryLogEntries(dir, query)) };
  } catch (error) {
    return { kind: 'error', text: `读取运行记录失败：${String(error)}` };
  }
}
