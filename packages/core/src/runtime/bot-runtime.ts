import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import type { PersonaBotRecord } from '../bots/persona-bot.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { ChannelMessage, ChannelRecord } from '../channels/channel.js';
import type { ChannelStore } from '../channels/store.js';
import {
  attachOperationalModule,
  type OperationalDatabaseModulePort,
  type OperationalDatabaseOwner,
} from '../database/owner.js';
import { createSessionOwnership, type SessionOwnership } from '../sessions/ownership.js';

export type AssignmentActivity = 'working' | 'idle' | 'error';
export type AssignmentReportState = 'completed' | 'blocked' | 'waiting-human' | 'failed';

export interface AssignmentReportInput {
  state: AssignmentReportState;
  summary: string;
}

export interface AssignmentReport extends AssignmentReportInput {
  at: string;
}

export interface AssignmentSummary {
  sessionId: string;
  purpose: string;
  activity: AssignmentActivity;
  latestReport?: AssignmentReport;
  createdAt: string;
  updatedAt: string;
}

export interface AssignmentDetail extends AssignmentSummary {
  botSlug: string;
  sourceEventId: string;
}

export interface OrchestratorAgentRun {
  sessionId: string;
  resume: boolean;
  bot: PersonaBotRecord;
  message: string;
  inboundChannelId: string;
  channels: OrchestratorChannelAccess;
  createAssignment(purpose: string): Promise<AssignmentReport>;
}

export interface AssignmentAgentRun {
  sessionId: string;
  bot: PersonaBotRecord;
  purpose: string;
  report(input: AssignmentReportInput): Promise<AssignmentReport>;
}

export interface ChannelMessageView {
  channelId: string;
  channelName: string;
  message: ChannelMessage;
}

export interface OrchestratorChannelAccess {
  read(input?: { channelId?: string; before?: string; limit?: number }): ChannelMessageView[];
  search(input: { query: string; channelId?: string; limit?: number }): ChannelMessageView[];
  send(input: { body: string; channelId?: string }): Promise<ChannelMessage>;
}

/** Adapter at the DSH Agent seam; tests and the pinned Host runtime satisfy the same interface. */
export interface BotAgentAdapter {
  runOrchestrator(run: OrchestratorAgentRun): Promise<void>;
  runAssignment(run: AssignmentAgentRun): Promise<void>;
  close(): Promise<void>;
}

export interface HandleDmMessageInput {
  channelId: string;
  messageId: string;
  body: string;
}

export type DmAdmissionFailure =
  | 'runtime-closed'
  | 'unknown-channel'
  | 'not-dm'
  | 'unknown-bot'
  | 'archived-bot'
  | 'blank-body';

export type DmMessageAdmission =
  | { admitted: true; settled: Promise<void> }
  | { admitted: false; reason: DmAdmissionFailure };

export interface BotRuntime {
  /**
   * Validate one Human DM against the current Channel and PersonaBot, durably
   * claim its Source Event, and schedule the Orchestrator turn on the
   * Channel's serial queue. Returns after admission and scheduling; the
   * returned `settled` promise resolves when that turn finishes and is never
   * awaited by the browser bridge.
   */
  admitDmMessage(input: HandleDmMessageInput): DmMessageAdmission;
  listAssignments(botSlug: string): AssignmentSummary[];
  getAssignment(botSlug: string, sessionId: string): AssignmentDetail | undefined;
  close(): Promise<void>;
}

export interface BotRuntimeOptions {
  database: OperationalDatabaseOwner;
  registry: PersonaBotRegistry;
  channels: ChannelStore;
  agents: BotAgentAdapter;
  /** Shared ownership interface; defaults to one bound to `database`. */
  ownership?: SessionOwnership;
  /** Explicit run-configuration root recorded as each Session's cwd reference. */
  workspaceRoot?: string;
  /**
   * Explicit Orchestrator working directory (the PersonaBot's Memory
   * Repository). Assignments keep the legacy workspace resolution until
   * Workspace Grants land.
   */
  orchestratorCwd?: (bot: PersonaBotRecord) => string | undefined;
  now?: () => Date;
  createSessionId?: () => string;
  createEventId?: () => string;
  createMessageId?: () => string;
}

interface AssignmentRow {
  session_id: string;
  source_event_id: string;
  bot_slug: string;
  purpose: string;
  activity: AssignmentActivity;
  latest_report_state: AssignmentReportState | null;
  latest_report_summary: string | null;
  latest_report_at: string | null;
  created_at: string;
  updated_at: string;
}

type SourceEventAttemptState = 'pending' | 'running' | 'retryable' | 'needs-repair' | 'handled';

interface SourceEventRow {
  source_event_id: string;
  bot_slug: string;
  body: string;
  handled_at: string | null;
  attempt_state: SourceEventAttemptState;
}

interface SourceEventClaim {
  sourceEventId: string;
  shouldRun: boolean;
  reconciliationRequired?: true;
}

function assignmentFromRow(row: AssignmentRow): AssignmentDetail {
  const latestReport =
    row.latest_report_state === null ||
    row.latest_report_summary === null ||
    row.latest_report_at === null
      ? undefined
      : {
          state: row.latest_report_state,
          summary: row.latest_report_summary,
          at: row.latest_report_at,
        };
  return {
    sessionId: row.session_id,
    sourceEventId: row.source_event_id,
    botSlug: row.bot_slug,
    purpose: row.purpose,
    activity: row.activity,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(latestReport === undefined ? {} : { latestReport }),
  };
}

function requireNonBlank(value: string, name: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new TypeError(`${name} must not be blank`);
  return normalized;
}

class BotRuntimeImplementation implements BotRuntime {
  readonly #database: OperationalDatabaseModulePort;
  readonly #ownership: SessionOwnership;
  readonly #workspaceRoot: string | undefined;
  readonly #orchestratorCwd: ((bot: PersonaBotRecord) => string | undefined) | undefined;
  readonly #registry: PersonaBotRegistry;
  readonly #channels: ChannelStore;
  readonly #agents: BotAgentAdapter;
  readonly #now: () => Date;
  readonly #createSessionId: () => string;
  readonly #createEventId: () => string;
  readonly #createMessageId: () => string;
  readonly #tails = new Map<string, Promise<unknown>>();
  #closed = false;

  constructor(options: BotRuntimeOptions) {
    this.#database = attachOperationalModule(options.database, 'bot-runtime');
    this.#ownership =
      options.ownership ??
      createSessionOwnership(attachOperationalModule(options.database, 'session-ownership'));
    this.#workspaceRoot = options.workspaceRoot;
    this.#orchestratorCwd = options.orchestratorCwd;
    this.#registry = options.registry;
    this.#channels = options.channels;
    this.#agents = options.agents;
    this.#now = options.now ?? (() => new Date());
    this.#createSessionId = options.createSessionId ?? (() => `botharness-${randomUUID()}`);
    this.#createEventId = options.createEventId ?? (() => randomUUID());
    this.#createMessageId = options.createMessageId ?? (() => randomUUID());
    // Recovery mode still mounts the plugin for files and diagnostics; every
    // Messaging operation there already fails closed, so skip the sweep.
    if (options.database.mode === 'ready') this.#recoverInterruptedAttempts();
  }

  admitDmMessage(input: HandleDmMessageInput): DmMessageAdmission {
    if (this.#closed) return { admitted: false, reason: 'runtime-closed' };
    const channel = this.#channels.get(input.channelId);
    if (channel === undefined) return { admitted: false, reason: 'unknown-channel' };
    if (channel.type !== 'dm' || channel.botSlug === undefined) {
      return { admitted: false, reason: 'not-dm' };
    }
    const bot = this.#registry.get(channel.botSlug);
    if (bot === undefined) return { admitted: false, reason: 'unknown-bot' };
    if (bot.paused === true) return { admitted: false, reason: 'archived-bot' };
    const body = input.body.trim();
    if (body.length === 0) return { admitted: false, reason: 'blank-body' };

    const timestamp = this.#now().toISOString();
    const claim = this.#claimSourceEvent(bot.slug, channel.id, input.messageId, body, timestamp);
    return {
      admitted: true,
      settled: this.#enqueue(channel.id, () => this.#runDmTurn(bot, channel.id, body, claim)),
    };
  }

  #enqueue(channelId: string, task: () => Promise<void>): Promise<void> {
    const previous = this.#tails.get(channelId) ?? Promise.resolve();
    const run = previous.then(task, task);
    this.#tails.set(
      channelId,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  }

  listAssignments(botSlug: string): AssignmentSummary[] {
    const rows = this.#database.read((database) =>
      database
        .prepare(
          `SELECT session_id, source_event_id, bot_slug, purpose, activity,
                  latest_report_state, latest_report_summary, latest_report_at,
                  created_at, updated_at
             FROM assignments
            WHERE bot_slug = ?
            ORDER BY updated_at DESC, session_id ASC`,
        )
        .all(botSlug),
    ) as unknown as AssignmentRow[];
    return rows.map((row) => {
      const {
        botSlug: _botSlug,
        sourceEventId: _sourceEventId,
        ...summary
      } = assignmentFromRow(row);
      return summary;
    });
  }

  getAssignment(botSlug: string, sessionId: string): AssignmentDetail | undefined {
    const row = this.#database.read((database) =>
      database
        .prepare(
          `SELECT session_id, source_event_id, bot_slug, purpose, activity,
                  latest_report_state, latest_report_summary, latest_report_at,
                  created_at, updated_at
             FROM assignments
            WHERE bot_slug = ? AND session_id = ?`,
        )
        .get(botSlug, sessionId),
    ) as AssignmentRow | undefined;
    return row === undefined ? undefined : assignmentFromRow(row);
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    await Promise.allSettled(this.#tails.values());
    this.#tails.clear();
    await this.#agents.close();
  }

  async #runDmTurn(
    bot: PersonaBotRecord,
    channelId: string,
    body: string,
    claim: SourceEventClaim,
  ): Promise<void> {
    if (claim.reconciliationRequired === true) {
      throw new Error(`Source Event ${claim.sourceEventId} requires reconciliation before replay`);
    }
    if (!claim.shouldRun) return;

    const timestamp = this.#now().toISOString();
    const orchestrator = this.#ensureOrchestrator(bot, timestamp);
    const markSideEffect = () => this.#markSideEffectStarted(claim.sourceEventId);
    try {
      await this.#agents.runOrchestrator({
        sessionId: orchestrator.sessionId,
        resume: orchestrator.resume,
        bot,
        message: body,
        inboundChannelId: channelId,
        channels: this.#channelAccess(bot.slug, channelId, markSideEffect),
        createAssignment: (purpose) => {
          const normalized = requireNonBlank(purpose, 'Assignment purpose');
          markSideEffect();
          return this.#createAssignment(bot, claim.sourceEventId, normalized);
        },
      });
    } catch (error) {
      this.#markSourceEventFailed(claim.sourceEventId);
      throw error;
    }
    const handledAt = this.#now().toISOString();
    this.#database.transaction(
      (database) => {
        database
          .prepare(
            `UPDATE source_events
                SET handled_at = ?, attempt_state = 'handled'
              WHERE source_event_id = ?`,
          )
          .run(handledAt, claim.sourceEventId);
      },
      ['source-event', 'bot-inbox'],
    );
  }

  #claimSourceEvent(
    botSlug: string,
    channelId: string,
    messageId: string,
    body: string,
    createdAt: string,
  ): SourceEventClaim {
    return this.#database.transaction(
      (database) => {
        const existing = database
          .prepare(
            `SELECT source_event_id, bot_slug, body, handled_at, attempt_state
               FROM source_events
              WHERE channel_id = ? AND message_id = ?`,
          )
          .get(channelId, messageId) as SourceEventRow | undefined;
        if (existing !== undefined) {
          if (existing.bot_slug !== botSlug || existing.body !== body) {
            throw new Error(`Source Event identity conflict for Channel message ${messageId}`);
          }
          if (existing.handled_at !== null || existing.attempt_state === 'handled') {
            return { sourceEventId: existing.source_event_id, shouldRun: false };
          }
          if (existing.attempt_state === 'running' || existing.attempt_state === 'needs-repair') {
            return {
              sourceEventId: existing.source_event_id,
              shouldRun: false,
              reconciliationRequired: true,
            };
          }
          database
            .prepare(
              `UPDATE source_events SET attempt_state = 'running'
                WHERE source_event_id = ?`,
            )
            .run(existing.source_event_id);
          return { sourceEventId: existing.source_event_id, shouldRun: true };
        }

        const sourceEventId = this.#createEventId();
        database
          .prepare(
            `INSERT INTO source_events (
               source_event_id, source_kind, bot_slug, channel_id, message_id,
               body, created_at, attempt_state
             ) VALUES (?, 'human-message', ?, ?, ?, ?, ?, 'running')`,
          )
          .run(sourceEventId, botSlug, channelId, messageId, body, createdAt);
        return { sourceEventId, shouldRun: true };
      },
      ['source-event', 'bot-inbox'],
    );
  }

  /**
   * Record that an external side effect started while the attempt stays
   * `running`: the attempt is no longer safely replayable, but it has not
   * failed yet. The marker survives a crash and is what boot recovery and the
   * failure path use to decide between reconciliation and retry.
   */
  #markSideEffectStarted(sourceEventId: string): void {
    this.#database.transaction(
      (database) => {
        database
          .prepare(
            `UPDATE source_events
                SET side_effect_started_at = COALESCE(side_effect_started_at, ?)
              WHERE source_event_id = ? AND attempt_state = 'running'`,
          )
          .run(this.#now().toISOString(), sourceEventId);
      },
      ['source-event', 'bot-inbox'],
    );
  }

  /** A failed attempt is retryable only when no side effect had started. */
  #markSourceEventFailed(sourceEventId: string): void {
    this.#database.transaction(
      (database) => {
        database
          .prepare(
            `UPDATE source_events
                SET attempt_state = CASE
                      WHEN side_effect_started_at IS NULL THEN 'retryable'
                      ELSE 'needs-repair'
                    END
              WHERE source_event_id = ? AND attempt_state = 'running'`,
          )
          .run(sourceEventId);
      },
      ['source-event', 'bot-inbox'],
    );
  }

  /**
   * Boot recovery for attempts a previous process left behind: an unfinished
   * attempt with a side effect needs reconciliation; one without is retryable.
   */
  #recoverInterruptedAttempts(): void {
    this.#database.transaction(
      (database) => {
        database
          .prepare(
            `UPDATE source_events SET attempt_state = 'needs-repair'
              WHERE attempt_state = 'running' AND side_effect_started_at IS NOT NULL`,
          )
          .run();
        database
          .prepare(
            `UPDATE source_events SET attempt_state = 'retryable'
              WHERE attempt_state = 'running' AND side_effect_started_at IS NULL`,
          )
          .run();
      },
      ['source-event', 'bot-inbox'],
    );
  }

  #channelAccess(
    botSlug: string,
    defaultChannelId: string,
    beforeSend: () => void = () => undefined,
  ): OrchestratorChannelAccess {
    const resolve = (requested?: string): ChannelRecord =>
      this.#requireMembership(botSlug, requested ?? defaultChannelId);
    return {
      read: (input = {}) => {
        const channel = resolve(input.channelId);
        return this.#channels
          .readMessages(channel.id, {
            ...(input.before === undefined ? {} : { before: input.before }),
            ...(input.limit === undefined ? {} : { limit: input.limit }),
          })
          .map((message) => ({
            channelId: channel.id,
            channelName: channel.name,
            message,
          }));
      },
      search: (input) => {
        const query = requireNonBlank(input.query, 'Channel search query').toLowerCase();
        const limit = Math.max(1, Math.min(input.limit ?? 20, 100));
        const channels =
          input.channelId === undefined
            ? this.#channels.list().filter((channel) => this.#isMember(botSlug, channel))
            : [resolve(input.channelId)];
        return channels
          .flatMap((channel) =>
            this.#channels
              .readMessages(channel.id, { limit: 200 })
              .filter((message) => message.body.toLowerCase().includes(query))
              .map((message) => ({
                channelId: channel.id,
                channelName: channel.name,
                message,
              })),
          )
          .sort(
            (left, right) =>
              right.message.at.localeCompare(left.message.at) ||
              right.message.id.localeCompare(left.message.id),
          )
          .slice(0, limit);
      },
      send: async (input) => {
        const channel = resolve(input.channelId);
        const body = requireNonBlank(input.body, 'Channel message body');
        beforeSend();
        const message: ChannelMessage = {
          id: this.#createMessageId(),
          at: this.#now().toISOString(),
          author: { kind: 'bot', slug: botSlug },
          body,
        };
        const appended = await this.#channels.appendMessage(channel.id, message);
        if (appended === undefined) throw new Error(`Channel disappeared: ${channel.id}`);
        return appended;
      },
    };
  }

  #isMember(botSlug: string, channel: ChannelRecord): boolean {
    return (
      channel.members.includes(botSlug) && (channel.type !== 'dm' || channel.botSlug === botSlug)
    );
  }

  #requireMembership(botSlug: string, channelId: string): ChannelRecord {
    const channel = this.#channels.get(channelId);
    if (channel === undefined) throw new Error(`Unknown Channel: ${channelId}`);
    if (!this.#isMember(botSlug, channel)) {
      throw new Error(`PersonaBot ${botSlug} is not a member of Channel ${channelId}`);
    }
    return channel;
  }

  #ensureOrchestrator(bot: PersonaBotRecord, at: string): { sessionId: string; resume: boolean } {
    const existing = this.#ownership.rootsFor(bot.slug, 'orchestrator')[0];
    if (existing !== undefined) return { sessionId: existing.sessionId, resume: true };
    const sessionId = this.#createSessionId();
    const cwdReference = this.#orchestratorCwdReference(bot);
    this.#ownership.claim({
      sessionId,
      botSlug: bot.slug,
      rootRole: 'orchestrator',
      ...(cwdReference === undefined ? {} : { cwdReference }),
      at,
    });
    return { sessionId, resume: false };
  }

  #orchestratorCwdReference(bot: PersonaBotRecord): string | undefined {
    return this.#orchestratorCwd?.(bot) ?? this.#cwdReference(bot);
  }

  #cwdReference(bot: PersonaBotRecord): string | undefined {
    const configured = bot.workspaces[0];
    if (configured !== undefined) return configured;
    return this.#workspaceRoot === undefined ? undefined : join(this.#workspaceRoot, bot.slug);
  }

  async #createAssignment(
    bot: PersonaBotRecord,
    sourceEventId: string,
    requestedPurpose: string,
  ): Promise<AssignmentReport> {
    const purpose = requireNonBlank(requestedPurpose, 'Assignment purpose');
    const sessionId = this.#createSessionId();
    const createdAt = this.#now().toISOString();
    this.#database.transaction(
      (database) => {
        const cwdReference = this.#cwdReference(bot);
        this.#ownership.claimWithin(database, {
          sessionId,
          botSlug: bot.slug,
          rootRole: 'assignment',
          ...(cwdReference === undefined ? {} : { cwdReference }),
          at: createdAt,
        });
        database
          .prepare(
            `INSERT INTO assignments (
               session_id, source_event_id, bot_slug, purpose, activity, created_at, updated_at
             ) VALUES (?, ?, ?, ?, 'working', ?, ?)`,
          )
          .run(sessionId, sourceEventId, bot.slug, purpose, createdAt, createdAt);
      },
      ['session-ownership', 'assignments'],
    );

    try {
      await this.#agents.runAssignment({
        sessionId,
        bot,
        purpose,
        report: async (input) => this.#recordReport(bot.slug, sessionId, input),
      });
      const assignment = this.getAssignment(bot.slug, sessionId);
      if (assignment?.latestReport === undefined) {
        throw new Error('Assignment finished without report_to_orchestrator');
      }
      this.#setActivity(sessionId, 'idle');
      return assignment.latestReport;
    } catch (error) {
      this.#setActivity(sessionId, 'error');
      throw error;
    }
  }

  #recordReport(
    botSlug: string,
    sessionId: string,
    input: AssignmentReportInput,
  ): AssignmentReport {
    const summary = requireNonBlank(input.summary, 'Assignment report summary');
    const at = this.#now().toISOString();
    const report: AssignmentReport = { state: input.state, summary, at };
    this.#database.transaction(
      (database) => {
        const changed = database
          .prepare(
            `UPDATE assignments
                SET latest_report_state = ?, latest_report_summary = ?, latest_report_at = ?,
                    updated_at = ?
              WHERE session_id = ? AND bot_slug = ?`,
          )
          .run(input.state, summary, at, at, sessionId, botSlug);
        if (changed.changes !== 1) throw new Error(`Unknown Assignment Session: ${sessionId}`);
        database
          .prepare(
            `INSERT INTO source_events (
               source_event_id, source_kind, bot_slug, assignment_session_id,
               body, created_at, handled_at, attempt_state
             ) VALUES (?, 'assignment-report', ?, ?, ?, ?, ?, 'handled')`,
          )
          .run(this.#createEventId(), botSlug, sessionId, summary, at, at);
      },
      ['assignments', 'source-event', 'bot-inbox'],
    );
    return report;
  }

  #setActivity(sessionId: string, activity: AssignmentActivity): void {
    const at = this.#now().toISOString();
    this.#database.transaction(
      (database) => {
        database
          .prepare('UPDATE assignments SET activity = ?, updated_at = ? WHERE session_id = ?')
          .run(activity, at, sessionId);
      },
      ['assignments'],
    );
  }
}

export function createBotRuntime(options: BotRuntimeOptions): BotRuntime {
  return new BotRuntimeImplementation(options);
}
