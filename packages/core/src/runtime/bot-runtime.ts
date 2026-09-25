import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import type { PersonaBotRecord } from '../bots/persona-bot.js';
import type { AssignmentAccessStore } from '../workspaces/assignment-access.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { MemoryService } from '../memory/service.js';
import type { ChannelMessage, ChannelRecord } from '../channels/channel.js';
import { ChannelReplyTargetError } from '../channels/store.js';
import type { ChannelAttachmentRef } from '../attachments/ref.js';
import type { ChannelStore } from '../channels/store.js';
import type { AttachmentStore } from '../attachments/store.js';
import {
  attachOperationalModule,
  type OperationalDatabaseModulePort,
  type OperationalDatabaseOwner,
} from '../database/owner.js';
import { createSessionOwnership, type SessionOwnership } from '../sessions/ownership.js';
import type {
  AssignmentPermissionSnapshot,
  WorkspaceGrant,
  WorkspaceGrantStore,
} from '../workspaces/grants.js';

export type AssignmentActivity = 'working' | 'idle' | 'error';
export type AssignmentReportState =
  | 'progress'
  | 'completed'
  | 'blocked'
  | 'waiting-human'
  | 'failed';
export type AssignmentRequestMode = 'next-step' | 'next-turn';

export interface AssignmentReportInput {
  state: AssignmentReportState;
  summary: string;
  /** The Assignment declares it needs an Orchestrator reply before continuing. */
  expectsReply?: boolean;
}

export interface AssignmentReport extends AssignmentReportInput {
  at: string;
}

export interface AssignmentOpenAsk {
  sourceEventId: string;
  summary: string;
  at: string;
}

export interface AssignmentSummary {
  sessionId: string;
  purpose: string;
  activity: AssignmentActivity;
  latestReport?: AssignmentReport;
  continuityKey?: string;
  openAsk?: AssignmentOpenAsk;
  permission?: AssignmentPermissionSnapshot;
  createdAt: string;
  updatedAt: string;
}

export interface AssignmentDetail extends AssignmentSummary {
  botSlug: string;
  sourceEventId: string;
}

export type AssignmentCreateOutcome =
  | { outcome: 'created'; assignment: AssignmentSummary }
  | { outcome: 'reused'; assignment: AssignmentSummary }
  | { outcome: 'key-busy' | 'capacity'; message: string };

export interface AssignmentRequestOutcome {
  assignment: AssignmentSummary;
  delivery: 'steer' | 'followup';
}

export interface OrchestratorAssignmentAccess {
  create(input: { purpose: string; key?: string; grantId: string }): AssignmentCreateOutcome;
  grants(): WorkspaceGrant[];
  list(): AssignmentSummary[];
  inspect(sessionId: string): AssignmentDetail | undefined;
  request(input: {
    sessionId: string;
    mode: AssignmentRequestMode;
    text: string;
    answerTo?: string;
  }): AssignmentRequestOutcome;
}

export interface OrchestratorAgentRun {
  sessionId: string;
  resume: boolean;
  bot: PersonaBotRecord;
  message: string;
  /** Bounded Bot Inbox block rendered by the runtime; empty when nothing is pending. */
  inbox: string;
  inboundChannelId: string;
  channels: OrchestratorChannelAccess;
  assignments: OrchestratorAssignmentAccess;
  memory?: {
    switchBranch(branch: string): { from: string; to: string; head: string };
    continueFromCommit(
      sha: string,
      branch: string,
    ): { from: string; to: string; head: string; accepted: boolean };
  };
}

export interface AssignmentAgentRun {
  sessionId: string;
  bot: PersonaBotRecord;
  purpose: string;
  /** An addressed request into an existing Session rather than an initial turn. */
  resume?: boolean;
  permission: AssignmentPermissionSnapshot;
  report(input: AssignmentReportInput): Promise<AssignmentReport>;
}

/** An addressed request is steered into a live run or accepted as a follow-up turn. */
export type AssignmentRequestDelivery =
  | { delivery: 'steer' }
  | { delivery: 'followup'; done: Promise<void> };

export interface ChannelMessageView {
  channelId: string;
  channelName: string;
  message: ChannelMessage;
}

export interface OrchestratorChannelAccess {
  read(input?: { channelId?: string; before?: string; limit?: number }): ChannelMessageView[];
  search(input: { query: string; channelId?: string; limit?: number }): ChannelMessageView[];
  readAttachment?(input: {
    channelId?: string;
    messageId: string;
    hash: string;
    maxBytes: number;
    signal?: AbortSignal;
  }): Promise<{ ref: ChannelAttachmentRef; data: Uint8Array }>;
  requestGrant(reason: string): Promise<ChannelMessage>;
  send(input: {
    body: string;
    channelId?: string;
    replyTo?: string;
    attachments?: ChannelAttachmentRef[];
  }): Promise<ChannelMessage>;
}

/** Adapter at the DSH Agent seam; tests and the pinned Host runtime satisfy the same interface. */
export interface BotAgentAdapter {
  runOrchestrator(run: OrchestratorAgentRun): Promise<void>;
  runAssignment(run: AssignmentAgentRun): Promise<void>;
  requestAssignment(run: AssignmentAgentRun): AssignmentRequestDelivery;
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
  /** Resolves when queued turns and detached Assignment runs have drained. */
  whenIdle(): Promise<void>;
  close(): Promise<void>;
}

export interface BotRuntimeOptions {
  database: OperationalDatabaseOwner;
  registry: PersonaBotRegistry;
  channels: ChannelStore;
  agents: BotAgentAdapter;
  memory?: Pick<
    MemoryService,
    'prepareTurn' | 'reconcileTurn' | 'abortTurn' | 'switchBranch' | 'continueFromCommit'
  >;
  /** Profile-scoped Channel attachment authority. */
  attachments?: AttachmentStore;
  /** Shared ownership interface; defaults to one bound to `database`. */
  ownership?: SessionOwnership;
  /** Human-owned Workspace Grant authority; Assignment creation fails closed when absent. */
  grants?: WorkspaceGrantStore;
  assignmentAccess?: AssignmentAccessStore;
  /** Explicit run-configuration root recorded as each Session's cwd reference. */
  workspaceRoot?: string;
  /**
   * Explicit Orchestrator working directory (the PersonaBot's Memory
   * Repository). Assignments keep the legacy workspace resolution until
   * Workspace Grants land.
   */
  orchestratorCwd?: (bot: PersonaBotRecord) => string | undefined;
  /** Profile-wide Assignment Concurrency Limit; defaults to 3. */
  assignmentConcurrencyLimit?: number;
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
  continuity_key: string | null;
  open_ask_source_event_id: string | null;
  open_ask_at: string | null;
  grant_id: string | null;
  workspace_id: string | null;
  primary_cwd: string | null;
  permission_mode: string | null;
  approval_policy: string | null;
  preset_revision: number | null;
  created_at: string;
  updated_at: string;
}

interface InboxReportRow {
  source_event_id: string;
  assignment_session_id: string | null;
  body: string;
  created_at: string;
  expects_reply: number;
  continuity_key: string | null;
  activity: AssignmentActivity | null;
}

interface InboxUnit {
  sourceEventId: string;
  assignmentSessionId: string | null;
  summary: string;
  createdAt: string;
  expectsReply: boolean;
  continuityKey: string | null;
  activity: AssignmentActivity | null;
  repeats: number;
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

function permissionFromRow(row: AssignmentRow): AssignmentPermissionSnapshot | undefined {
  if (
    row.grant_id === null ||
    row.workspace_id === null ||
    row.primary_cwd === null ||
    (row.permission_mode !== 'workspace-write' && row.permission_mode !== 'danger-full-access') ||
    row.approval_policy !== (row.permission_mode === 'workspace-write' ? 'ask' : 'never') ||
    row.preset_revision === null
  )
    return undefined;
  return {
    grantId: row.grant_id,
    workspaceId: row.workspace_id,
    primaryCwd: row.primary_cwd,
    mode: row.permission_mode,
    approval: row.approval_policy,
    presetRevision: row.preset_revision,
  };
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
  const openAsk =
    row.open_ask_source_event_id === null || row.open_ask_at === null
      ? undefined
      : {
          sourceEventId: row.open_ask_source_event_id,
          summary: row.latest_report_summary ?? '',
          at: row.open_ask_at,
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
    ...(row.continuity_key === null ? {} : { continuityKey: row.continuity_key }),
    ...(openAsk === undefined ? {} : { openAsk }),
    ...(permissionFromRow(row) === undefined ? {} : { permission: permissionFromRow(row)! }),
  };
}

/** The inbox block coalesces unobserved reports of one Assignment into one unit. */
function coalesceInbox(rows: InboxReportRow[]): InboxUnit[] {
  const units = new Map<string, InboxUnit>();
  for (const row of rows) {
    const key = row.assignment_session_id ?? row.source_event_id;
    const existing = units.get(key);
    if (existing === undefined) {
      units.set(key, {
        sourceEventId: row.source_event_id,
        assignmentSessionId: row.assignment_session_id,
        summary: row.body,
        createdAt: row.created_at,
        expectsReply: row.expects_reply === 1,
        continuityKey: row.continuity_key,
        activity: row.activity,
        repeats: 1,
      });
      continue;
    }
    existing.sourceEventId = row.source_event_id;
    existing.summary = row.body;
    existing.createdAt = row.created_at;
    existing.expectsReply = row.expects_reply === 1;
    existing.activity = row.activity;
    existing.repeats += 1;
  }
  return [...units.values()];
}

function renderInbox(units: InboxUnit[]): string {
  const lines = units.map((unit) => {
    const target = unit.assignmentSessionId ?? 'unknown Assignment';
    const facts = [
      `key ${unit.continuityKey}`,
      `activity ${unit.activity ?? 'unknown'}`,
      `repeats ${unit.repeats}`,
    ].join(', ');
    if (unit.expectsReply) {
      return `- ${target} (${facts}) WAITING for your answer (answer_to: ${unit.sourceEventId}): ${unit.summary}`;
    }
    return `- ${target} (${facts}) reported: ${unit.summary}`;
  });
  return [
    '[Bot Inbox] New Assignment reports since your last turn. Answer an item that waits for',
    'your answer with send_assignment_request using its answer_to value; otherwise use them as',
    'context. Do not repeat these summaries back verbatim.',
    ...lines,
  ].join('\n');
}

function requireNonBlank(value: string, name: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new TypeError(`${name} must not be blank`);
  return normalized;
}

function sessionFailureDetails(error: unknown): { code?: string; status?: number; detail: string } {
  const raw = error instanceof Error ? error.message : String(error);
  const clean = Array.from(raw, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || code === 127 ? ' ' : character;
  })
    .join('')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 600);
  const match = /^([A-Z][A-Z0-9_-]{1,31}):\s*(.+)$/u.exec(clean);
  const detail = (match?.[2] ?? clean) || 'Unknown session error';
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? (error as { status?: unknown }).status
      : undefined;
  return {
    ...(match === null ? {} : { code: match[1] }),
    ...(typeof status === 'number' ? { status } : {}),
    detail,
  };
}

class BotRuntimeImplementation implements BotRuntime {
  readonly #database: OperationalDatabaseModulePort;
  readonly #ownership: SessionOwnership;
  readonly #grants: WorkspaceGrantStore | undefined;
  readonly #assignmentAccessPresetStore: AssignmentAccessStore | undefined;
  readonly #workspaceRoot: string | undefined;
  readonly #orchestratorCwd: ((bot: PersonaBotRecord) => string | undefined) | undefined;
  readonly #registry: PersonaBotRegistry;
  readonly #channels: ChannelStore;
  readonly #agents: BotAgentAdapter;
  readonly #memory: BotRuntimeOptions['memory'];
  readonly #attachments: AttachmentStore | undefined;
  readonly #now: () => Date;
  readonly #createSessionId: () => string;
  readonly #createEventId: () => string;
  readonly #createMessageId: () => string;
  readonly #assignmentConcurrencyLimit: number;
  readonly #tails = new Map<string, Promise<unknown>>();
  readonly #assignmentRuns = new Map<string, Promise<void>>();
  #closed = false;

  constructor(options: BotRuntimeOptions) {
    this.#database = attachOperationalModule(options.database, 'bot-runtime');
    this.#grants = options.grants;
    this.#assignmentAccessPresetStore = options.assignmentAccess;
    this.#ownership =
      options.ownership ??
      createSessionOwnership(attachOperationalModule(options.database, 'session-ownership'));
    this.#workspaceRoot = options.workspaceRoot;
    this.#orchestratorCwd = options.orchestratorCwd;
    this.#registry = options.registry;
    this.#channels = options.channels;
    this.#agents = options.agents;
    this.#memory = options.memory;
    this.#attachments = options.attachments;
    this.#now = options.now ?? (() => new Date());
    this.#createSessionId = options.createSessionId ?? (() => `botharness-${randomUUID()}`);
    this.#createEventId = options.createEventId ?? (() => randomUUID());
    this.#createMessageId = options.createMessageId ?? (() => randomUUID());
    this.#assignmentConcurrencyLimit = Math.min(
      Math.max(options.assignmentConcurrencyLimit ?? 3, 1),
      32,
    );
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
      settled: this.#enqueue(bot.slug, () => this.#runDmTurn(bot, channel.id, body, claim)),
    };
  }

  #enqueue(turnKey: string, task: () => Promise<void>): Promise<void> {
    const previous = this.#tails.get(turnKey) ?? Promise.resolve();
    const run = previous.then(task, task);
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    this.#tails.set(turnKey, tail);
    void tail.then(() => {
      if (this.#tails.get(turnKey) === tail) this.#tails.delete(turnKey);
    });
    return run;
  }

  listAssignments(botSlug: string): AssignmentSummary[] {
    const rows = this.#database.read((database) =>
      database
        .prepare(
          `SELECT session_id, source_event_id, bot_slug, purpose, activity,
                  latest_report_state, latest_report_summary, latest_report_at,
                  continuity_key, open_ask_source_event_id, open_ask_at,
                  grant_id, workspace_id, primary_cwd, permission_mode,
                  approval_policy, preset_revision, created_at, updated_at
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
                  continuity_key, open_ask_source_event_id, open_ask_at,
                  grant_id, workspace_id, primary_cwd, permission_mode,
                  approval_policy, preset_revision, created_at, updated_at
             FROM assignments
            WHERE bot_slug = ? AND session_id = ?`,
        )
        .get(botSlug, sessionId),
    ) as AssignmentRow | undefined;
    return row === undefined ? undefined : assignmentFromRow(row);
  }

  async whenIdle(): Promise<void> {
    for (;;) {
      const pending = [...this.#tails.values(), ...this.#assignmentRuns.values()];
      if (pending.length === 0) return;
      await Promise.allSettled(pending);
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    await Promise.allSettled([...this.#tails.values(), ...this.#assignmentRuns.values()]);
    this.#tails.clear();
    this.#assignmentRuns.clear();
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
    // Pending reports ride the Human turn too; Observation is recorded the
    // moment the block enters the turn input and rolled back if the turn fails.
    const collected = this.#collectInbox(bot.slug);
    this.#setObserved(collected.eventIds, timestamp);
    try {
      await this.#runOrchestratorTurn(
        bot,
        orchestrator,
        claim.sourceEventId,
        channelId,
        body,
        collected.inbox,
      );
    } catch (error) {
      this.#setObserved(collected.eventIds, null);
      this.#markSourceEventFailed(claim.sourceEventId);
      await this.#publishSessionFailure({
        channelId,
        botSlug: bot.slug,
        sessionId: orchestrator.sessionId,
        role: 'orchestrator',
        error,
      });
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

  async #runOrchestratorTurn(
    bot: PersonaBotRecord,
    orchestrator: { sessionId: string; resume: boolean },
    sourceEventId: string,
    channelId: string,
    body: string,
    inbox: string,
  ): Promise<void> {
    const markSideEffect = () => this.#markSideEffectStarted(sourceEventId);
    this.#memory?.prepareTurn(bot.slug, orchestrator.sessionId);
    try {
      await this.#agents.runOrchestrator({
        sessionId: orchestrator.sessionId,
        resume: orchestrator.resume,
        bot,
        message: body,
        inbox,
        inboundChannelId: channelId,
        channels: this.#channelAccess(bot.slug, channelId, markSideEffect),
        memory: {
          continueFromCommit: (sha, branch) => {
            if (this.#memory === undefined) throw new Error('Memory is unavailable');
            const result = this.#memory.continueFromCommit({
              botSlug: bot.slug,
              sessionId: orchestrator.sessionId,
              sha,
              branch,
            });
            markSideEffect();
            return result;
          },
          switchBranch: (branch) => {
            if (this.#memory === undefined) throw new Error('Memory is unavailable');
            const result = this.#memory.switchBranch({
              botSlug: bot.slug,
              sessionId: orchestrator.sessionId,
              branch,
            });
            markSideEffect();
            return result;
          },
        },
        assignments: this.#assignmentAccess(bot, sourceEventId),
      });
      this.#memory?.reconcileTurn({
        botSlug: bot.slug,
        sessionId: orchestrator.sessionId,
        sourceEventId,
      });
    } catch (error) {
      this.#memory?.abortTurn(bot.slug, orchestrator.sessionId);
      throw error;
    }
  }

  async #publishSessionFailure(input: {
    channelId: string;
    botSlug: string;
    sessionId: string;
    role: 'orchestrator' | 'assignment';
    error: unknown;
    context?: string;
  }): Promise<void> {
    const details = sessionFailureDetails(input.error);
    const failure = {
      role: input.role,
      sessionId: input.sessionId,
      ...details,
      ...(input.context === undefined ? {} : { context: input.context }),
    };
    const result = await this.#channels.appendMessage(input.channelId, {
      id: `session-failure-${randomUUID()}`,
      at: this.#now().toISOString(),
      author: { kind: 'bot', slug: input.botSlug },
      body: `Session failed: ${details.code === undefined ? '' : details.code + ': '}${details.detail}`,
      format: 'text',
      sessionFailure: failure,
    });
    if (result === undefined) {
      throw new Error('Could not publish Session failure: Channel is missing');
    }
  }

  #assignmentAccess(bot: PersonaBotRecord, sourceEventId: string): OrchestratorAssignmentAccess {
    // Creating or waking an Assignment Session crosses into DSH, so the current
    // attempt is no longer safely replayable once either starts.
    const markSideEffect = (): void => this.#markSideEffectStarted(sourceEventId);
    return {
      create: (input) => {
        const outcome = this.#createOrReuseAssignment(bot, sourceEventId, input);
        if (outcome.outcome === 'created' || outcome.outcome === 'reused') markSideEffect();
        return outcome;
      },
      grants: () => this.#grants?.list(bot.slug) ?? [],
      list: () => this.listAssignments(bot.slug),
      inspect: (sessionId) => this.getAssignment(bot.slug, sessionId),
      request: (input) => {
        const outcome = this.#requestAssignment(bot, input);
        markSideEffect();
        return outcome;
      },
    };
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
      readAttachment: async (input) => {
        const channel = resolve(input.channelId);
        const message = this.#channels.message(channel.id, input.messageId);
        if (message === undefined) throw new Error(`Channel message not found: ${input.messageId}`);
        const ref = message.attachments?.find((candidate) => candidate.hash === input.hash);
        if (ref === undefined) {
          throw new Error(
            `Attachment ${input.hash} is not attached to Channel message ${input.messageId}`,
          );
        }
        if (!ref.mime.startsWith('image/')) {
          throw new Error(`Attachment ${ref.name} is not a supported Channel image`);
        }
        if (ref.size > input.maxBytes) {
          throw new Error(
            `Attachment ${ref.name} exceeds the ${input.maxBytes}-byte model read limit`,
          );
        }
        if (this.#attachments === undefined)
          throw new Error('Channel attachment store unavailable');
        const downloaded = await this.#attachments.download(ref.hash, ref.name, input.signal);
        const data = new Uint8Array(await new Response(downloaded.body).arrayBuffer());
        if (data.byteLength !== ref.size) {
          throw new Error(`Attachment ${ref.name} changed while being read`);
        }
        return { ref: downloaded.ref, data };
      },
      requestGrant: async (reason) => {
        const channel = resolve();
        if (channel.type !== 'dm' || channel.botSlug !== botSlug) {
          throw new Error('Workspace Grant requests must be sent in this PersonaBot DM');
        }
        const body = requireNonBlank(reason, 'Workspace Grant request reason');
        beforeSend();
        const message: ChannelMessage = {
          id: this.#createMessageId(),
          at: this.#now().toISOString(),
          author: { kind: 'bot', slug: botSlug },
          body,
          grantRequest: true,
        };
        const appended = await this.#channels.appendMessage(channel.id, message);
        if (appended === undefined) throw new Error(`Channel disappeared: ${channel.id}`);
        return appended;
      },
      send: async (input) => {
        const channel = resolve(input.channelId);
        const body = input.body;
        if (!body.trim() && !input.attachments?.length)
          throw new Error('Channel message requires a body or attachment');
        this.#channels.assertAttachmentRefs(input.attachments ?? []);
        if (input.replyTo !== undefined && !this.#channels.hasMessage(channel.id, input.replyTo)) {
          throw new ChannelReplyTargetError();
        }
        beforeSend();
        const message: ChannelMessage = {
          id: this.#createMessageId(),
          at: this.#now().toISOString(),
          author: { kind: 'bot', slug: botSlug },
          body,
          ...(input.attachments === undefined ? {} : { attachments: input.attachments }),
          ...(input.replyTo === undefined ? {} : { replyTo: input.replyTo }),
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

  #createOrReuseAssignment(
    bot: PersonaBotRecord,
    sourceEventId: string,
    input: { purpose: string; key?: string; grantId: string },
  ): AssignmentCreateOutcome {
    const purpose = requireNonBlank(input.purpose, 'Assignment purpose');
    const grantId = requireNonBlank(input.grantId, 'Workspace Grant id');
    if (this.#grants === undefined) throw new Error('Workspace Grants are unavailable');
    const grant = this.#grants.requireActive(bot.slug, grantId);
    const access = this.#assignmentAccessPresetStore?.get(bot.slug) ?? {
      mode: 'workspace-write' as const,
      revision: 0,
    };
    const permission: AssignmentPermissionSnapshot = {
      grantId: grant.id,
      workspaceId: grant.workspaceId,
      primaryCwd: grant.workspacePath,
      mode: access.mode,
      approval: access.mode === 'danger-full-access' ? 'never' : 'ask',
      presetRevision: access.revision,
    };
    const key = input.key === undefined ? undefined : requireNonBlank(input.key, 'Continuity Key');
    if (key !== undefined) {
      const holder = this.#assignmentByKey(bot.slug, key);
      if (holder !== undefined && holder.grant_id !== grant.id) {
        throw new Error('Continuity Key belongs to an Assignment with a different Workspace Grant');
      }
      if (holder !== undefined && holder.activity === 'idle') {
        this.#requestAssignment(bot, {
          sessionId: holder.session_id,
          mode: 'next-turn',
          text: purpose,
        });
        return {
          outcome: 'reused',
          assignment: this.#requireAssignmentSummary(bot.slug, holder.session_id),
        };
      }
      if (holder !== undefined) {
        return {
          outcome: 'key-busy',
          message: `Continuity Key ${key} is held by running Assignment ${holder.session_id}; send it a request, wait, or create a new Assignment without the key.`,
        };
      }
    }
    if (this.#activeAssignmentCount() >= this.#assignmentConcurrencyLimit) {
      return {
        outcome: 'capacity',
        message: `Assignment Concurrency Limit ${this.#assignmentConcurrencyLimit} reached; retryable: true. Nothing was created.`,
      };
    }
    const sessionId = this.#createSessionId();
    const createdAt = this.#now().toISOString();
    this.#database.transaction(
      (database) => {
        const cwdReference = permission.primaryCwd;
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
               session_id, source_event_id, bot_slug, purpose, activity, continuity_key,
               grant_id, workspace_id, primary_cwd, permission_mode, approval_policy,
               preset_revision, created_at, updated_at
             ) VALUES (?, ?, ?, ?, 'working', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            sessionId,
            sourceEventId,
            bot.slug,
            purpose,
            key ?? null,
            permission.grantId,
            permission.workspaceId,
            permission.primaryCwd,
            permission.mode,
            permission.approval,
            permission.presetRevision,
            createdAt,
            createdAt,
          );
      },
      ['session-ownership', 'assignments'],
    );
    this.#trackAssignmentRun(sessionId, () =>
      this.#agents.runAssignment({
        sessionId,
        bot,
        purpose,
        permission,
        report: async (report) => this.#recordReport(bot.slug, sessionId, report),
      }),
    );
    return { outcome: 'created', assignment: this.#requireAssignmentSummary(bot.slug, sessionId) };
  }

  #requestAssignment(
    bot: PersonaBotRecord,
    input: { sessionId: string; mode: AssignmentRequestMode; text: string; answerTo?: string },
  ): AssignmentRequestOutcome {
    const row = this.#assignmentRow(bot.slug, input.sessionId);
    if (row === undefined) throw new Error(`Unknown Assignment Session: ${input.sessionId}`);
    const permission = permissionFromRow(row);
    if (permission === undefined || this.#grants === undefined) {
      throw new Error('Assignment has no valid Workspace Grant snapshot');
    }
    const grant = this.#grants.requireActive(bot.slug, permission.grantId);
    if (
      grant.workspaceId !== permission.workspaceId ||
      grant.workspacePath !== permission.primaryCwd
    ) {
      throw new Error('Assignment Workspace Grant no longer matches its permission snapshot');
    }
    const text = requireNonBlank(input.text, 'Assignment Request text');
    if (row.activity === 'error') {
      throw new Error(
        `Assignment Session ${input.sessionId} failed; start a new Assignment instead`,
      );
    }
    const at = this.#now().toISOString();
    if (input.answerTo !== undefined && input.answerTo !== row.open_ask_source_event_id) {
      throw new Error(
        `Assignment Session ${input.sessionId} has no open ask ${input.answerTo}; inspect it before answering`,
      );
    }
    if (row.open_ask_source_event_id !== null) {
      this.#database.transaction(
        (database) => {
          database
            .prepare(
              `UPDATE assignments
                  SET open_ask_source_event_id = NULL, open_ask_at = NULL, updated_at = ?
                WHERE session_id = ? AND bot_slug = ?`,
            )
            .run(at, input.sessionId, bot.slug);
        },
        ['assignments'],
      );
    }
    const run: AssignmentAgentRun = {
      sessionId: input.sessionId,
      bot,
      purpose: text,
      resume: true,
      permission,
      report: async (report) => this.#recordReport(bot.slug, input.sessionId, report),
    };
    const delivery = this.#agents.requestAssignment(run);
    if (delivery.delivery === 'followup') {
      this.#trackAssignmentRun(input.sessionId, () => delivery.done);
    } else {
      this.#setActivity(input.sessionId, 'working');
    }
    return {
      assignment: this.#requireAssignmentSummary(bot.slug, input.sessionId),
      delivery: delivery.delivery,
    };
  }

  #trackAssignmentRun(sessionId: string, task: () => Promise<void>): void {
    const run = (async () => {
      if (this.#assignmentRow(undefined, sessionId) === undefined) return;
      this.#setActivity(sessionId, 'working');
      try {
        await task();
        this.#setActivity(sessionId, 'idle');
      } catch (error) {
        this.#setActivity(sessionId, 'error');
        const row = this.#assignmentRow(undefined, sessionId);
        if (row !== undefined) {
          const channel = this.#dmChannel(row.bot_slug);
          if (channel !== undefined) {
            await this.#publishSessionFailure({
              channelId: channel.id,
              botSlug: row.bot_slug,
              sessionId,
              role: 'assignment',
              error,
              context: row.purpose,
            });
          }
        }
      }
    })();
    const tracked = run.then(
      () => {
        if (this.#assignmentRuns.get(sessionId) === tracked) this.#assignmentRuns.delete(sessionId);
      },
      () => {
        if (this.#assignmentRuns.get(sessionId) === tracked) this.#assignmentRuns.delete(sessionId);
      },
    );
    this.#assignmentRuns.set(sessionId, tracked);
  }

  #assignmentRow(botSlug: string | undefined, sessionId: string): AssignmentRow | undefined {
    return this.#database.read(
      (database) =>
        (botSlug === undefined
          ? database.prepare(`SELECT * FROM assignments WHERE session_id = ?`).get(sessionId)
          : database
              .prepare(`SELECT * FROM assignments WHERE bot_slug = ? AND session_id = ?`)
              .get(botSlug, sessionId)) as AssignmentRow | undefined,
    );
  }

  #assignmentByKey(botSlug: string, continuityKey: string): AssignmentRow | undefined {
    return this.#database.read(
      (database) =>
        database
          .prepare(`SELECT * FROM assignments WHERE bot_slug = ? AND continuity_key = ?`)
          .get(botSlug, continuityKey) as AssignmentRow | undefined,
    );
  }

  #activeAssignmentCount(): number {
    return this.#database.read((database) => {
      const row = database
        .prepare(`SELECT COUNT(*) AS count FROM assignments WHERE activity = 'working'`)
        .get() as { count: number };
      return row.count;
    });
  }

  #requireAssignmentSummary(botSlug: string, sessionId: string): AssignmentSummary {
    const assignment = this.getAssignment(botSlug, sessionId);
    if (assignment === undefined) throw new Error(`Unknown Assignment Session: ${sessionId}`);
    return assignment;
  }

  #recordReport(
    botSlug: string,
    sessionId: string,
    input: AssignmentReportInput,
  ): AssignmentReport {
    const summary = requireNonBlank(input.summary, 'Assignment report summary');
    const at = this.#now().toISOString();
    const expectsReply = input.expectsReply === true;
    const report: AssignmentReport = {
      state: input.state,
      summary,
      at,
      ...(expectsReply ? { expectsReply: true } : {}),
    };
    const sourceEventId = this.#createEventId();
    this.#database.transaction(
      (database) => {
        const changed = database
          .prepare(
            `UPDATE assignments
                SET latest_report_state = ?, latest_report_summary = ?, latest_report_at = ?,
                    updated_at = ?,
                    open_ask_source_event_id = CASE WHEN ? = 1 THEN ? ELSE NULL END,
                    open_ask_at = CASE WHEN ? = 1 THEN ? ELSE NULL END
              WHERE session_id = ? AND bot_slug = ?`,
          )
          .run(
            input.state,
            summary,
            at,
            at,
            expectsReply ? 1 : 0,
            sourceEventId,
            expectsReply ? 1 : 0,
            at,
            sessionId,
            botSlug,
          );
        if (changed.changes !== 1) throw new Error(`Unknown Assignment Session: ${sessionId}`);
        database
          .prepare(
            `INSERT INTO source_events (
               source_event_id, source_kind, bot_slug, assignment_session_id,
               body, created_at, handled_at, attempt_state, expects_reply
             ) VALUES (?, 'assignment-report', ?, ?, ?, ?, ?, 'handled', ?)`,
          )
          .run(sourceEventId, botSlug, sessionId, summary, at, at, expectsReply ? 1 : 0);
      },
      ['assignments', 'source-event', 'bot-inbox'],
    );
    if (this.#shouldWakeNow(input.state, expectsReply)) this.#scheduleInboxTurn(botSlug);
    return report;
  }

  #shouldWakeNow(state: AssignmentReportState, expectsReply: boolean): boolean {
    return expectsReply || state !== 'progress';
  }

  #scheduleInboxTurn(botSlug: string): void {
    void this.#enqueue(botSlug, () => this.#runInboxTurn(botSlug));
  }

  async #runInboxTurn(botSlug: string): Promise<void> {
    if (this.#closed) return;
    const bot = this.#registry.get(botSlug);
    if (bot === undefined || bot.paused === true) return;
    const channel = this.#dmChannel(botSlug);
    if (channel === undefined) return;
    const collected = this.#collectInbox(botSlug);
    if (collected.eventIds.length === 0) return;
    const timestamp = this.#now().toISOString();
    const orchestrator = this.#ensureOrchestrator(bot, timestamp);
    this.#setObserved(collected.eventIds, timestamp);
    try {
      await this.#runOrchestratorTurn(
        bot,
        orchestrator,
        collected.eventIds[0] ?? orchestrator.sessionId,
        channel.id,
        '',
        collected.inbox,
      );
    } catch (error) {
      this.#setObserved(collected.eventIds, null);
      await this.#publishSessionFailure({
        channelId: channel.id,
        botSlug,
        sessionId: orchestrator.sessionId,
        role: 'orchestrator',
        error,
      });
      throw error;
    }
  }

  #collectInbox(botSlug: string): { inbox: string; eventIds: string[] } {
    const rows = this.#database.read(
      (database) =>
        database
          .prepare(
            `SELECT e.source_event_id, e.assignment_session_id, e.body, e.created_at,
                    e.expects_reply, a.continuity_key, a.activity
               FROM source_events e
               LEFT JOIN assignments a ON a.session_id = e.assignment_session_id
              WHERE e.bot_slug = ? AND e.source_kind = 'assignment-report'
                AND e.observed_at IS NULL
              ORDER BY e.rowid DESC
              LIMIT 20`,
          )
          .all(botSlug) as unknown as InboxReportRow[],
    );
    // Newest-first in SQL bounds the batch; coalescing reads oldest-first so the
    // unit keeps the latest summary and its repeat count.
    rows.reverse();
    const units = coalesceInbox(rows);
    const [firstUnit] = units;
    return {
      inbox: firstUnit === undefined ? '' : renderInbox(units),
      eventIds: rows.map((row) => row.source_event_id),
    };
  }

  #dmChannel(botSlug: string): ChannelRecord | undefined {
    return this.#channels
      .list()
      .find((channel) => channel.type === 'dm' && channel.botSlug === botSlug);
  }

  #setObserved(sourceEventIds: string[], at: string | null): void {
    if (sourceEventIds.length === 0) return;
    const placeholders = sourceEventIds.map(() => '?').join(', ');
    this.#database.transaction(
      (database) => {
        database
          .prepare(
            `UPDATE source_events SET observed_at = ?
              WHERE source_event_id IN (${placeholders})`,
          )
          .run(at, ...sourceEventIds);
      },
      ['source-event', 'bot-inbox'],
    );
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
