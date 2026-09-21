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
  BotAgentAdapter,
  OrchestratorAgentRun,
} from './bot-runtime.js';

const ROLE_PROMPT_ORDER = 10_350;

const ORCHESTRATOR_PROMPT = `You are the Orchestrator for one PersonaBot.
For this tracer-bullet runtime, every nonblank Human message must create exactly one Assignment by calling create_assignment with a concise purpose. Wait for its report, then call channel_send exactly once to answer the triggering Channel.
Your ordinary assistant final text stays inside the Orchestrator Session and is never a Human-facing Channel message. To speak in a Channel, explicitly call channel_send. The current inbound Channel is the default; channel_read and channel_search can inspect Channels that this PersonaBot has joined.`;

const ASSIGNMENT_PROMPT = `You are an Assignment Agent executing one bounded item for an Orchestrator.
Complete the stated purpose using the tools available in this Agent scope. Before finishing, call report_to_orchestrator exactly once with a concise summary and one state: completed, blocked, waiting-human, or failed. Do not address the Human directly.`;

export interface DshAgentHost {
  create(options: CreateAgentOptions): Promise<AgentHandle>;
  resume(options: ResumeAgentOptions): Promise<AgentHandle>;
}

export interface DshBotAgentAdapterOptions {
  agents: DshAgentHost;
  defaultModel: DshDefaultModelHost;
  defaultWorkspaceRoot: string;
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
) {
  ensureWorkspace(cwd);
  return {
    cwd,
    ...(run.bot.preset === undefined ? {} : { agentPreset: run.bot.preset }),
  };
}

function isReportState(value: string): value is AssignmentReportState {
  return (
    value === 'completed' || value === 'blocked' || value === 'waiting-human' || value === 'failed'
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
    this.#ensureWorkspace =
      options.ensureWorkspace ?? ((path) => void mkdirSync(path, { recursive: true }));
    this.#drafts = new ChannelDraftTracker(options.publishDraft ?? (() => undefined));
  }

  async runOrchestrator(run: OrchestratorAgentRun): Promise<void> {
    this.#assertOpen();
    this.#runs.set(run.sessionId, { role: 'orchestrator', run });
    this.#drafts.begin(run.sessionId, {
      channelId: run.inboundChannelId,
      botSlug: run.bot.slug,
      canAccess: (channelId) => {
        try {
          run.channels.read({ channelId, limit: 1 });
          return true;
        } catch {
          return false;
        }
      },
    });
    try {
      const handle = await this.#orchestratorHandle(run);
      const fromSeq = handle.agent.session.seq;
      handle.agent.followup(
        createUserMessage({
          content: [{ type: 'text', text: run.message }],
          source: { kind: 'user' },
        }),
      );
      await handle.agent.whenIdle();
      requireCompletedTurn(handle, fromSeq);
    } finally {
      this.#drafts.end(run.sessionId);
    }
  }

  acceptAssistantStream(sessionId: string, frame: AssistantStreamFrame): void {
    this.#drafts.accept(sessionId, frame);
  }

  async runAssignment(run: AssignmentAgentRun): Promise<void> {
    this.#assertOpen();
    this.#runs.set(run.sessionId, { role: 'assignment', run, reported: false });
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
    const active = this.#runs.get(run.sessionId);
    if (active?.role !== 'assignment' || !active.reported) {
      throw new Error('Assignment finished without report_to_orchestrator');
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
    const setup: NonNullable<CreateAgentOptions['setup']> = (agentCtx) => {
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
            'Create and run one independent Assignment Session, wait for its report, and return that report.',
          parameters: {
            purpose: {
              type: 'string',
              required: true,
              description: 'A concise, bounded description of the work to complete.',
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
            const report = await active.run.createAssignment(args.purpose);
            return `${report.state}: ${report.summary}`;
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
            return `Sent Channel message ${message.id}.`;
          },
        }),
      );
    };
    const options = { agentOptions: resolvedAgentOptions, setup };
    const meta = createMeta(run, this.#resolveCwd(run.bot, 'orchestrator'), this.#ensureWorkspace);
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
    const meta = createMeta(run, this.#resolveCwd(run.bot, 'assignment'), this.#ensureWorkspace);
    const resolvedAgentOptions = agentOptions(run, this.#defaultModel.currentSelection());
    const handle = await this.#agents.create({
      sessionId: SessionId(run.sessionId),
      ...(meta === undefined ? {} : { meta }),
      agentOptions: resolvedAgentOptions,
      setup: (agentCtx) => {
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
              'Report this Assignment outcome to its Orchestrator. Call exactly once before finishing.',
            parameters: {
              state: {
                type: 'string',
                required: true,
                description: 'One of: completed, blocked, waiting-human, failed.',
              },
              summary: {
                type: 'string',
                required: true,
                description: 'Concise outcome, blocker, or question for the Orchestrator.',
              },
            },
            output: {
              schema: { type: 'string' },
              render: (_args, value) => [{ type: 'text', text: value }],
            },
            execute: async (args) => {
              if (!isReportState(args.state)) {
                throw new Error(
                  'report_to_orchestrator: state must be completed, blocked, waiting-human, or failed',
                );
              }
              const active = this.#runs.get(run.sessionId);
              if (active?.role !== 'assignment') {
                throw new Error('report_to_orchestrator: Assignment run is unavailable');
              }
              await active.run.report({ state: args.state, summary: args.summary });
              active.reported = true;
              return 'Report delivered to the Orchestrator.';
            },
          }),
        );
      },
    });
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
