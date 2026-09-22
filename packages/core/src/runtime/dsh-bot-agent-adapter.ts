import type { Context } from '@deepseek-ai/cordis';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  installModelSelection,
  type AgentHandle,
  type AssistantStreamFrame,
  type CreateAgentOptions,
  type ModelSelection,
  type ResumeAgentOptions,
} from '@deepseek-ai/dsh-agent';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { SessionId, type SessionLogOffset } from '@deepseek-ai/dsh-session';
import { defineTool } from '@deepseek-ai/dsh-tools';

import type { PersonaBotRecord } from '../bots/persona-bot.js';
import { ChannelDraftTracker, type ChannelDraftEvent } from '../channels/draft.js';
import type {
  AssignmentAgentRun,
  AssignmentReportState,
  AssignmentRequestDelivery,
  BotAgentAdapter,
  OrchestratorAgentRun,
} from './bot-runtime.js';

const ROLE_PROMPT_ORDER = 10_350;

const ORCHESTRATOR_PROMPT = `You are the Orchestrator for one PersonaBot, and your working directory is its Memory Repository.
You own the Human conversation and the memory: answer the triggering Channel with channel_send whenever the Human is waiting, and record durable facts yourself with ordinary file, Shell, grep, and git capabilities inside your working directory. Reading an Assignment report never writes memory for you — you decide what to persist.
create_assignment starts one Assignment immediately and returns its Session id; it does not wait. Delegate bounded independent work that benefits from its own working directory or parallel execution, and always pass a short continuity key naming that direction; reuse a key only for the same direction, so an idle keyed Assignment continues with your new instruction instead of a second Session being created. Two independent directions may run at the same time. A simple question, a memory update, or a Channel reply stays with you and must not be delegated.
Assignment reports and questions arrive in the [Bot Inbox] block of your next turn. An item marked WAITING needs your answer: reply with send_assignment_request and its answer_to value, and the Assignment resumes from your answer. Progress items need no reply; use list_assignments and inspect_assignment when you need current facts, and never poll for reports. Keep Assignment purposes concise and self-contained; long results belong in files the Assignment can point at, not in the summary.
Your ordinary assistant final text stays inside the Orchestrator Session and is never a Human-facing Channel message. To speak in a Channel, explicitly call channel_send. The current inbound Channel is the default; channel_read and channel_search can inspect Channels that this PersonaBot has joined.`;

const ASSIGNMENT_PROMPT = `You are an Assignment Agent executing one bounded item for an Orchestrator.
Work in your own working directory with the tools available in this Agent scope, and never write to the PersonaBot's Memory Repository — only the Orchestrator owns memory.
Report progress at meaningful milestones with report_to_orchestrator state progress, and report one terminal state before finishing: completed, blocked, waiting-human, or failed, including anything worth remembering so the Orchestrator can persist it.
If you cannot proceed without an Orchestrator decision, report with state blocked (or waiting-human when the Human must decide) and expects_reply true, then end your turn: you will be resumed with the answer as your next message. Do not block waiting, do not address the Human directly, and keep summaries short — point at files instead of pasting long content.`;

export interface DshAgentHost {
  create(options: CreateAgentOptions): Promise<AgentHandle>;
  resume(options: ResumeAgentOptions): Promise<AgentHandle>;
}

/**
 * The agent-preset roster that composes a session's tools and prompt sections.
 * A session that names a preset but never mounts it sees only the tools its own
 * factory setup registered, so mounting is not optional.
 */
export interface DshAgentPresetHost {
  mount(agentCtx: Context, id?: string): Promise<unknown>;
}

export interface DshBotAgentAdapterOptions {
  agents: DshAgentHost;
  defaultModel: DshDefaultModelHost;
  defaultWorkspaceRoot: string;
  /**
   * Resolves the preset roster lazily: a service may mount after this plugin
   * applies, so the roster is looked up per agent creation, not captured once.
   */
  resolveAgentPresets?: () => DshAgentPresetHost | undefined;
  /**
   * Agent preset a PersonaBot session joins when its record names none. Every
   * session must join one: an agent without a preset resolves against the
   * empty global layer and sees only the tools its own setup registered.
   */
  defaultAgentPreset?: string;
  /**
   * Explicit Orchestrator working directory (the PersonaBot's Memory
   * Repository). Absent falls back to the legacy workspace resolution.
   */
  orchestratorCwd?: (bot: PersonaBotRecord) => string | undefined;
  ensureWorkspace?: (path: string) => void;
  publishDraft?: (event: ChannelDraftEvent) => void;
}

export interface DshDefaultModelHost {
  currentSelection(): ModelSelection;
}

type ActiveRun =
  | { role: 'orchestrator'; run: OrchestratorAgentRun }
  | { role: 'assignment'; run: AssignmentAgentRun; reported: boolean };

function agentOptions(
  run: OrchestratorAgentRun | AssignmentAgentRun,
  defaultSelection: ModelSelection,
): ModelSelection {
  return run.bot.model === undefined
    ? defaultSelection
    : { ...defaultSelection, model: run.bot.model };
}

function createMeta(
  run: OrchestratorAgentRun | AssignmentAgentRun,
  cwd: string,
  ensureWorkspace: (path: string) => void,
  defaultAgentPreset: string | undefined,
) {
  ensureWorkspace(cwd);
  const agentPreset = run.bot.preset ?? defaultAgentPreset;
  return {
    cwd,
    ...(agentPreset === undefined ? {} : { agentPreset }),
  };
}

function isReportState(value: string): value is AssignmentReportState {
  return (
    value === 'progress' ||
    value === 'completed' ||
    value === 'blocked' ||
    value === 'waiting-human' ||
    value === 'failed'
  );
}

function requireCompletedTurn(handle: AgentHandle, fromSeq: SessionLogOffset): void {
  const turnEnd = handle.agent.session
    .snapshotEvents(fromSeq)
    .find((event) => event.type === 'turn/end');
  if (turnEnd === undefined) {
    throw new Error('Agent became idle without a durable turn/end');
  }
  const reason = turnEnd.data.reason;
  if (reason.kind === 'completed') return;
  if (reason.kind === 'error') {
    throw new Error(`${reason.error.code}: ${reason.error.message}`);
  }
  throw new Error(`Agent turn ended without completion: ${reason.kind}`);
}

class DshBotAgentAdapter implements BotAgentAdapter {
  readonly #agents: DshAgentHost;
  readonly #defaultModel: DshDefaultModelHost;
  readonly #defaultWorkspaceRoot: string;
  readonly #orchestratorCwd: ((bot: PersonaBotRecord) => string | undefined) | undefined;
  readonly #defaultAgentPreset: string | undefined;
  readonly #resolveAgentPresets: (() => DshAgentPresetHost | undefined) | undefined;
  readonly #ensureWorkspace: (path: string) => void;
  readonly #handles = new Map<string, AgentHandle>();
  readonly #runs = new Map<string, ActiveRun>();
  readonly #drafts: ChannelDraftTracker;
  #closed = false;

  constructor(options: DshBotAgentAdapterOptions) {
    this.#agents = options.agents;
    this.#defaultModel = options.defaultModel;
    this.#defaultWorkspaceRoot = options.defaultWorkspaceRoot;
    this.#orchestratorCwd = options.orchestratorCwd;
    this.#defaultAgentPreset = options.defaultAgentPreset;
    this.#resolveAgentPresets = options.resolveAgentPresets;
    this.#ensureWorkspace =
      options.ensureWorkspace ?? ((path) => void mkdirSync(path, { recursive: true }));
    this.#drafts = new ChannelDraftTracker(options.publishDraft ?? (() => undefined));
  }

  async runOrchestrator(run: OrchestratorAgentRun): Promise<void> {
    this.#assertOpen();
    const entry: ActiveRun = { role: 'orchestrator', run };
    this.#runs.set(run.sessionId, entry);
    const access = new Map<string, boolean>();
    this.#drafts.begin(run.sessionId, {
      channelId: run.inboundChannelId,
      botSlug: run.bot.slug,
      canAccess: (channelId) => {
        const cached = access.get(channelId);
        if (cached !== undefined) return cached;
        try {
          run.channels.read({ channelId, limit: 1 });
          access.set(channelId, true);
          return true;
        } catch {
          access.set(channelId, false);
          return false;
        }
      },
    });
    try {
      const handle = await this.#orchestratorHandle(run);
      const fromSeq = handle.agent.session.seq;
      const text = [run.inbox, run.message].filter((part) => part.trim().length > 0).join('\n\n');
      handle.agent.followup(
        createUserMessage({
          content: [{ type: 'text', text }],
          source: { kind: 'user' },
        }),
      );
      await handle.agent.whenIdle();
      requireCompletedTurn(handle, fromSeq);
    } finally {
      this.#drafts.end(run.sessionId);
      if (this.#runs.get(run.sessionId) === entry) this.#runs.delete(run.sessionId);
    }
  }

  acceptAssistantStream(sessionId: string, frame: AssistantStreamFrame): void {
    this.#drafts.accept(sessionId, frame);
  }

  async runAssignment(run: AssignmentAgentRun): Promise<void> {
    this.#assertOpen();
    await this.#driveAssignment(run);
  }

  requestAssignment(run: AssignmentAgentRun): AssignmentRequestDelivery {
    this.#assertOpen();
    const handle = this.#handles.get(run.sessionId);
    const active = this.#runs.get(run.sessionId);
    // Only a mid-turn Assignment can be steered; a live but settled Agent is
    // followed up so the caller keeps a completion signal for the new turn.
    if (handle !== undefined && active?.role === 'assignment') {
      handle.agent.steer(
        createUserMessage({
          content: [{ type: 'text', text: run.purpose }],
          source: { kind: 'user' },
        }),
      );
      return { delivery: 'steer' };
    }
    return { delivery: 'followup', done: this.#driveAssignment(run) };
  }

  async #driveAssignment(run: AssignmentAgentRun): Promise<void> {
    const entry: ActiveRun = { role: 'assignment', run, reported: false };
    this.#runs.set(run.sessionId, entry);
    try {
      const handle = await this.#assignmentHandle(run);
      const fromSeq = handle.agent.session.seq;
      handle.agent.followup(
        createUserMessage({
          content: [{ type: 'text', text: run.purpose }],
          source: { kind: 'user' },
        }),
      );
      await handle.agent.whenIdle();
      requireCompletedTurn(handle, fromSeq);
      if (run.resume === true) return;
      if (!entry.reported) {
        throw new Error('Assignment finished without report_to_orchestrator');
      }
    } finally {
      if (this.#runs.get(run.sessionId) === entry) this.#runs.delete(run.sessionId);
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    const handles = [...this.#handles.values()];
    this.#handles.clear();
    for (const sessionId of this.#runs.keys()) this.#drafts.end(sessionId);
    this.#runs.clear();
    await Promise.all(handles.map(async (handle) => handle.dispose()));
  }

  async #orchestratorHandle(run: OrchestratorAgentRun): Promise<AgentHandle> {
    const existing = this.#handles.get(run.sessionId);
    if (existing !== undefined) return existing;
    const resolvedAgentOptions = agentOptions(run, this.#defaultModel.currentSelection());
    const setup: NonNullable<CreateAgentOptions['setup']> = async (agentCtx) => {
      await this.#composePreset(agentCtx, run.bot);
      installModelSelection(agentCtx, { current: resolvedAgentOptions, assembled: undefined });
      agentCtx.systemPrompt.section({
        name: 'botharness:orchestrator-role',
        order: ROLE_PROMPT_ORDER,
        text: ORCHESTRATOR_PROMPT,
      });
      agentCtx.tools.register(
        defineTool({
          name: 'create_assignment',
          description:
            'Start one independent Assignment Session and return its Session id immediately. Pass a continuity key to continue the same direction of work in the keyed Assignment instead of creating another one; omit the key for a different direction.',
          parameters: {
            purpose: {
              type: 'string',
              required: true,
              description: 'A concise, bounded description of the work to complete.',
            },
            key: {
              type: 'string',
              description:
                'Optional continuity key naming this direction of work; reuse it to continue the same Assignment.',
            },
          },
          output: {
            schema: { type: 'string' },
            render: (_args, value) => [{ type: 'text', text: value }],
          },
          execute: async (args) => {
            const active = this.#runs.get(run.sessionId);
            if (active?.role !== 'orchestrator') {
              throw new Error('create_assignment: Orchestrator run is unavailable');
            }
            const outcome = active.run.assignments.create({
              purpose: args.purpose,
              ...(args.key === undefined ? {} : { key: args.key }),
            });
            if (outcome.outcome === 'created' || outcome.outcome === 'reused') {
              return JSON.stringify({
                outcome: outcome.outcome,
                sessionId: outcome.assignment.sessionId,
                purpose: outcome.assignment.purpose,
                activity: outcome.assignment.activity,
              });
            }
            return JSON.stringify({
              outcome: outcome.outcome,
              retryable: true,
              message: outcome.message,
            });
          },
        }),
      );
      agentCtx.tools.register(
        defineTool({
          name: 'list_assignments',
          description:
            'List this PersonaBot Assignments with current activity, latest report, continuity key, and any open question waiting for your answer.',
          parameters: {},
          output: {
            schema: { type: 'string' },
            render: (_args, value) => [{ type: 'text', text: value }],
          },
          execute: async () => {
            const active = this.#runs.get(run.sessionId);
            if (active?.role !== 'orchestrator') {
              throw new Error('list_assignments: Orchestrator run is unavailable');
            }
            return JSON.stringify(active.run.assignments.list());
          },
        }),
      );
      agentCtx.tools.register(
        defineTool({
          name: 'inspect_assignment',
          description:
            'Inspect one Assignment by Session id: purpose, activity, latest report, and the question it waits on when one is open.',
          parameters: {
            session_id: {
              type: 'string',
              required: true,
              description: 'Assignment Session id returned by create_assignment.',
            },
          },
          output: {
            schema: { type: 'string' },
            render: (_args, value) => [{ type: 'text', text: value }],
          },
          execute: async (args) => {
            const active = this.#runs.get(run.sessionId);
            if (active?.role !== 'orchestrator') {
              throw new Error('inspect_assignment: Orchestrator run is unavailable');
            }
            const detail = active.run.assignments.inspect(args.session_id);
            return detail === undefined
              ? JSON.stringify({ error: `Unknown Assignment Session: ${args.session_id}` })
              : JSON.stringify(detail);
          },
        }),
      );
      agentCtx.tools.register(
        defineTool({
          name: 'send_assignment_request',
          description:
            'Send an addressed request to one Assignment Session. Use answer_to to answer the question that item waits on; the answer resumes the Assignment. Without answer_to it sends new work to an idle Assignment.',
          parameters: {
            session_id: {
              type: 'string',
              required: true,
              description: 'Assignment Session id.',
            },
            text: {
              type: 'string',
              required: true,
              description: 'The instruction or answer to deliver.',
            },
            mode: {
              type: 'string',
              description:
                'next-turn (default) continues after the current turn; next-step steers a running Assignment at its next step.',
            },
            answer_to: {
              type: 'string',
              description: 'The answer_to value from a Bot Inbox item that waits for your answer.',
            },
          },
          output: {
            schema: { type: 'string' },
            render: (_args, value) => [{ type: 'text', text: value }],
          },
          execute: async (args) => {
            const active = this.#runs.get(run.sessionId);
            if (active?.role !== 'orchestrator') {
              throw new Error('send_assignment_request: Orchestrator run is unavailable');
            }
            if (args.mode !== undefined && args.mode !== 'next-turn' && args.mode !== 'next-step') {
              throw new Error('send_assignment_request: mode must be next-turn or next-step');
            }
            const outcome = active.run.assignments.request({
              sessionId: args.session_id,
              mode: args.mode ?? 'next-turn',
              text: args.text,
              ...(args.answer_to === undefined ? {} : { answerTo: args.answer_to }),
            });
            return JSON.stringify({
              sessionId: outcome.assignment.sessionId,
              activity: outcome.assignment.activity,
              delivery: outcome.delivery,
            });
          },
        }),
      );
      agentCtx.tools.register(
        defineTool({
          name: 'channel_read',
          description:
            'Read recent messages from a Channel this PersonaBot has joined. Omit channel_id to read the Channel that triggered the current turn.',
          parameters: {
            channel_id: {
              type: 'string',
              description: 'Channel id; defaults to the inbound Channel.',
            },
            before: { type: 'string', description: 'Message id cursor for the previous page.' },
            limit: { type: 'number', description: 'Page size from 1 to 200.' },
          },
          output: {
            schema: { type: 'string' },
            render: (_args, value) => [{ type: 'text', text: value }],
          },
          execute: async (args) => {
            const active = this.#runs.get(run.sessionId);
            if (active?.role !== 'orchestrator') {
              throw new Error('channel_read: Orchestrator run is unavailable');
            }
            return JSON.stringify(
              active.run.channels.read({
                ...(args.channel_id === undefined ? {} : { channelId: args.channel_id }),
                ...(args.before === undefined ? {} : { before: args.before }),
                ...(args.limit === undefined ? {} : { limit: args.limit }),
              }),
            );
          },
        }),
      );
      agentCtx.tools.register(
        defineTool({
          name: 'channel_search',
          description:
            'Search messages in Channels this PersonaBot has joined. Omit channel_id to search every joined Channel.',
          parameters: {
            query: { type: 'string', required: true, description: 'Case-insensitive substring.' },
            channel_id: { type: 'string', description: 'Optional Channel id to limit the search.' },
            limit: { type: 'number', description: 'Maximum results from 1 to 100.' },
          },
          output: {
            schema: { type: 'string' },
            render: (_args, value) => [{ type: 'text', text: value }],
          },
          execute: async (args) => {
            const active = this.#runs.get(run.sessionId);
            if (active?.role !== 'orchestrator') {
              throw new Error('channel_search: Orchestrator run is unavailable');
            }
            return JSON.stringify(
              active.run.channels.search({
                query: args.query,
                ...(args.channel_id === undefined ? {} : { channelId: args.channel_id }),
                ...(args.limit === undefined ? {} : { limit: args.limit }),
              }),
            );
          },
        }),
      );
      agentCtx.tools.register(
        defineTool({
          name: 'channel_send',
          description:
            'Send one Human-facing message as this PersonaBot to a Channel it has joined. Omit channel_id to use the Channel that triggered the current turn.',
          parameters: {
            body: { type: 'string', required: true, description: 'Message body.' },
            channel_id: {
              type: 'string',
              description: 'Channel id; defaults to the inbound Channel.',
            },
          },
          output: {
            schema: { type: 'string' },
            render: (_args, value) => [{ type: 'text', text: value }],
          },
          execute: async (args) => {
            const active = this.#runs.get(run.sessionId);
            if (active?.role !== 'orchestrator') {
              throw new Error('channel_send: Orchestrator run is unavailable');
            }
            const message = await active.run.channels.send({
              body: args.body,
              ...(args.channel_id === undefined ? {} : { channelId: args.channel_id }),
            });
            this.#drafts.settle(
              run.sessionId,
              args.channel_id ?? run.inboundChannelId,
              message.body,
            );
            return `Sent Channel message ${message.id}.`;
          },
        }),
      );
    };
    const options = { agentOptions: resolvedAgentOptions, setup };
    const meta = createMeta(
      run,
      this.#resolveCwd(run.bot, 'orchestrator'),
      this.#ensureWorkspace,
      this.#defaultAgentPreset,
    );
    const handle = run.resume
      ? await this.#agents.resume({
          resumeSessionId: SessionId(run.sessionId),
          ...options,
        })
      : await this.#agents.create({
          sessionId: SessionId(run.sessionId),
          ...(meta === undefined ? {} : { meta }),
          ...options,
        });
    this.#handles.set(run.sessionId, handle);
    return handle;
  }

  async #composePreset(agentCtx: Context, bot: PersonaBotRecord): Promise<void> {
    const presets = this.#resolveAgentPresets?.();
    if (presets === undefined) return;
    await presets.mount(agentCtx, bot.preset ?? this.#defaultAgentPreset);
  }

  #resolveCwd(bot: PersonaBotRecord, role: 'orchestrator' | 'assignment'): string {
    if (role === 'orchestrator') {
      const explicit = this.#orchestratorCwd?.(bot);
      if (explicit !== undefined) return explicit;
    }
    return bot.workspaces[0] ?? join(this.#defaultWorkspaceRoot, bot.slug);
  }

  async #assignmentHandle(run: AssignmentAgentRun): Promise<AgentHandle> {
    const existing = this.#handles.get(run.sessionId);
    if (existing !== undefined) return existing;
    const meta = createMeta(
      run,
      this.#resolveCwd(run.bot, 'assignment'),
      this.#ensureWorkspace,
      this.#defaultAgentPreset,
    );
    const resolvedAgentOptions = agentOptions(run, this.#defaultModel.currentSelection());
    const createOptions: CreateAgentOptions = {
      sessionId: SessionId(run.sessionId),
      ...(meta === undefined ? {} : { meta }),
      agentOptions: resolvedAgentOptions,
      setup: async (agentCtx) => {
        await this.#composePreset(agentCtx, run.bot);
        installModelSelection(agentCtx, { current: resolvedAgentOptions, assembled: undefined });
        agentCtx.systemPrompt.section({
          name: 'botharness:assignment-role',
          order: ROLE_PROMPT_ORDER,
          text: ASSIGNMENT_PROMPT,
        });
        agentCtx.tools.register(
          defineTool({
            name: 'report_to_orchestrator',
            description:
              'Report progress or an outcome to the Orchestrator. Report progress at milestones and one terminal state before finishing; set expects_reply when you need an Orchestrator answer to continue.',
            parameters: {
              state: {
                type: 'string',
                required: true,
                description: 'One of: progress, completed, blocked, waiting-human, failed.',
              },
              summary: {
                type: 'string',
                required: true,
                description:
                  'Concise outcome, blocker, or question; point at files instead of pasting long content.',
              },
              expects_reply: {
                type: 'boolean',
                description:
                  'True when you cannot continue before the Orchestrator answers; end your turn after reporting and you will be resumed with the answer.',
              },
            },
            output: {
              schema: { type: 'string' },
              render: (_args, value) => [{ type: 'text', text: value }],
            },
            execute: async (args) => {
              if (!isReportState(args.state)) {
                throw new Error(
                  'report_to_orchestrator: state must be progress, completed, blocked, waiting-human, or failed',
                );
              }
              const active = this.#runs.get(run.sessionId);
              if (active?.role !== 'assignment') {
                throw new Error('report_to_orchestrator: Assignment run is unavailable');
              }
              await active.run.report({
                state: args.state,
                summary: args.summary,
                ...(args.expects_reply === undefined
                  ? {}
                  : { expectsReply: args.expects_reply === true }),
              });
              active.reported = true;
              return 'Report delivered to the Orchestrator.';
            },
          }),
        );
      },
    };
    const handle =
      run.resume === true
        ? await this.#agents.resume({
            resumeSessionId: SessionId(run.sessionId),
            agentOptions: resolvedAgentOptions,
            setup: createOptions.setup!,
          })
        : await this.#agents.create(createOptions);
    this.#handles.set(run.sessionId, handle);
    return handle;
  }

  #assertOpen(): void {
    if (this.#closed) throw new Error('DSH Bot Agent adapter is closed');
  }
}

export function createDshBotAgentAdapter(options: DshBotAgentAdapterOptions): BotAgentAdapter & {
  acceptAssistantStream(sessionId: string, frame: AssistantStreamFrame): void;
} {
  return new DshBotAgentAdapter(options);
}
