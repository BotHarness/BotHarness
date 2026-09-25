import type { Context } from '@deepseek-ai/cordis';
import { mkdirSync } from 'node:fs';

import {
  installModelSelection,
  type Agent,
  type AgentHandle,
  type AssistantStreamFrame,
  type CreateAgentOptions,
  type ModelSelection,
  type ResumeAgentOptions,
} from '@deepseek-ai/dsh-agent';
import { AttachmentId, type ImageMediaType } from '@deepseek-ai/dsh-attachment';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { SessionId, type SessionLogOffset } from '@deepseek-ai/dsh-session';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy';
import { setApprovalPolicy } from '@deepseek-ai/dsh-user-approval';

import type { PersonaBotRecord } from '../bots/persona-bot.js';
import { MemoryAcceptError } from '../memory/accepted.js';
import { ChannelDraftTracker, type ChannelDraftEvent } from '../channels/draft.js';
import type {
  AssignmentAgentRun,
  AssignmentReportState,
  AssignmentRequestDelivery,
  BotAgentAdapter,
  OrchestratorAgentRun,
} from './bot-runtime.js';

const ROLE_PROMPT_ORDER = 10_350;
const CHANNEL_IMAGE_MEDIA_TYPES: readonly ImageMediaType[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];

const ORCHESTRATOR_PROMPT = `You are the Orchestrator for one PersonaBot, and your working directory is its Memory Repository.
You own the Human conversation and the memory: answer the triggering Channel with channel_send whenever the Human is waiting. Use DSH's native read, write, edit, glob, and grep tools for files. You may read your Memory Repository and active Workspace Grants, but write only your Memory Repository. Shell and other tools that cannot be checked by file path require one-time Human approval in the Bot Channel. Explain why you need the call and wait for the decision. Reading an Assignment report never writes memory for you — you decide what to persist.
Call list_workspace_grants to find a Human-authorized DSH Workspace Grant, then pass its grant_id to create_assignment. If no active Grant fits the Human's requested work, call request_workspace_grant with a concise reason in the current DM, then end your turn. The Human chooses and authorizes a folder on that card; their action returns to this same Orchestrator Session, where you list Grants again and create the Assignment. create_assignment starts one Assignment immediately and returns its Session id; it does not wait. Delegate bounded independent work that benefits from its own working directory or parallel execution, and always pass a short continuity key naming that direction; reuse a key only for the same direction, so an idle keyed Assignment continues with your new instruction instead of a second Session being created. Two independent directions may run at the same time. A simple question, a memory update, or a Channel reply stays with you and must not be delegated. When the Human asks to change Memory branches without naming an exact branch, use DSH's native ask_user_question to ask which branch they mean. Offer relevant existing branches, accept a custom answer, and wait for the Human's answer in this Channel before switching. An explicit exact branch name needs no question. When the Human explicitly requests switching to an existing Memory branch, call memory_switch_branch with its exact name, then use the native file tools to read the new branch content and report the result in the Channel. When the Human explicitly asks to continue from a historical Memory commit, call memory_continue_from_commit with the exact commit SHA and requested new branch name; then read from the switched working tree in the same Session. A pending raw commit remains unaccepted and needs repair before later turns. If a Memory branch switch is blocked, do not claim success. Use list_assignments and inspect_assignment to identify relevant active work, then send_assignment_request in next-step mode to ask the affected Assignment to pause at a safe point, preserve its own workspace work, and report; Assignments must never edit Memory. Report the target branch and conflict in the Channel. After sending the request, call channel_send with the target branch, Assignment id, and coordination progress. After the report, inspect the Memory Git state, preserve unfinished Memory with a named native Git stash including untracked files when safe, and retry memory_switch_branch. If coordination cannot make the switch safe, report the target and the blocked reason. Never reset, force-checkout, or discard changes.
Assignment reports and questions arrive in the [Bot Inbox] block of your next turn. An item marked WAITING needs your answer: reply with send_assignment_request and its answer_to value, and the Assignment resumes from your answer. Progress items need no reply; use list_assignments and inspect_assignment when you need current facts, and never poll for reports. Keep Assignment purposes concise and self-contained; long results belong in files the Assignment can point at, not in the summary.
Your ordinary assistant final text stays inside the Orchestrator Session and is never a Human-facing Channel message. To speak in a Channel, explicitly call channel_send. The current inbound Channel is the default; channel_read and channel_search can inspect Channels that this PersonaBot has joined. Use channel_read_image with the message id and opaque attachment hash from channel_read when the Human asks about an image; never search the Host filesystem for Channel uploads.`;

const ASSIGNMENT_PROMPT = `You are an Assignment Agent executing one bounded item for an Orchestrator.
Use DSH's native read, write, edit, glob, and grep tools in your selected Workspace Grant. Never access another workspace or the PersonaBot's Memory Repository — only the Orchestrator owns memory. Shell and other tools that cannot be checked by file path require Human approval in the Bot Channel unless the Human has saved a matching automatic rule. Wait when an approval card is shown.
Report progress at meaningful milestones with report_to_orchestrator state progress, and report one terminal state before finishing: completed, blocked, waiting-human, or failed, including anything worth remembering so the Orchestrator can persist it.
If you cannot proceed without an Orchestrator decision, report with state blocked (or waiting-human when the Human must decide) and expects_reply true, then end your turn: you will be resumed with the answer as your next message. Do not block waiting, do not address the Human directly, and keep summaries short — point at files instead of pasting long content.`;

const DANGER_ASSIGNMENT_PROMPT = `You are an Assignment Agent executing one bounded item for an Orchestrator.
The Human explicitly enabled dangerous full access before this Assignment was created. Native tools may access files outside the selected Workspace Grant and do not ask for each call. Keep actions within the Orchestrator's requested task; report any wider file access. The selected Grant still identifies this Assignment and revoking it stops future calls. Only the Orchestrator owns PersonaBot memory unless your task explicitly requires interacting with it.
Report progress at meaningful milestones with report_to_orchestrator state progress, and report one terminal state before finishing: completed, blocked, waiting-human, or failed, including anything worth remembering so the Orchestrator can persist it.
If you cannot proceed without an Orchestrator decision, report with state blocked (or waiting-human when the Human must decide) and expects_reply true, then end your turn: you will be resumed with the answer as your next message. Do not block waiting, do not address the Human directly, and keep summaries short — point at files instead of pasting long content.`;

export interface DshAgentHost {
  create(options: CreateAgentOptions): Promise<AgentHandle>;
  resume(options: ResumeAgentOptions): Promise<AgentHandle>;
  get?(id: ReturnType<typeof SessionId>): Agent | undefined;
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
  /** Validate a foreign live Agent before attaching BotHarness role behavior. */
  authorizeBorrow?: (agent: Agent, role: 'orchestrator' | 'assignment') => void;
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
  ensureWorkspace: ((path: string) => void) | undefined,
  defaultAgentPreset: string | undefined,
) {
  ensureWorkspace?.(cwd);
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
    const failure = new Error(`${reason.error.code}: ${reason.error.message}`);
    if ('status' in reason.error && typeof reason.error.status === 'number') {
      Object.assign(failure, { status: reason.error.status });
    }
    throw failure;
  }
  throw new Error(`Agent turn ended without completion: ${reason.kind}`);
}

class DshBotAgentAdapter implements BotAgentAdapter {
  readonly #agents: DshAgentHost;
  readonly #defaultModel: DshDefaultModelHost;
  readonly #orchestratorCwd: ((bot: PersonaBotRecord) => string | undefined) | undefined;
  readonly #defaultAgentPreset: string | undefined;
  readonly #authorizeBorrow:
    | ((agent: Agent, role: 'orchestrator' | 'assignment') => void)
    | undefined;
  readonly #resolveAgentPresets: (() => DshAgentPresetHost | undefined) | undefined;
  readonly #ensureWorkspace: (path: string) => void;
  readonly #handles = new Map<string, AgentHandle>();
  readonly #runs = new Map<string, ActiveRun>();
  readonly #drafts: ChannelDraftTracker;
  #closed = false;

  constructor(options: DshBotAgentAdapterOptions) {
    this.#agents = options.agents;
    this.#defaultModel = options.defaultModel;
    this.#orchestratorCwd = options.orchestratorCwd;
    this.#defaultAgentPreset = options.defaultAgentPreset;
    this.#authorizeBorrow = options.authorizeBorrow;
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

  steerOrchestrator(botSlug: string, text: string): boolean {
    this.#assertOpen();
    for (const [sessionId, active] of this.#runs) {
      if (active.role !== 'orchestrator' || active.run.bot.slug !== botSlug) continue;
      const handle = this.#handles.get(sessionId);
      if (handle === undefined) return false;
      handle.agent.steer(
        createUserMessage({
          content: [{ type: 'text', text }],
          source: { kind: 'user' },
        }),
      );
      return true;
    }
    return false;
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
    const borrowedDisposers: Array<() => void> = [];
    const setup = async (agentCtx: Context, agent: Agent, borrowed = false): Promise<void> => {
      setSandboxMode(agent.session, 'workspace-write');
      setApprovalPolicy(agent.session, 'ask');
      if (!borrowed) {
        await this.#composePreset(agentCtx, run.bot);
        installModelSelection(agentCtx, { current: resolvedAgentOptions, assembled: undefined });
      }
      const registerTool = (tool: Parameters<typeof agentCtx.tools.register>[0]) => {
        const dispose = agentCtx.tools.register(tool);
        if (borrowed) borrowedDisposers.push(dispose);
        return dispose;
      };
      const disposePresentation = agentCtx.tools.presentAs('native');
      if (borrowed) borrowedDisposers.push(disposePresentation);
      const disposeRolePrompt = agentCtx.systemPrompt.section({
        name: 'botharness:orchestrator-role',
        order: ROLE_PROMPT_ORDER,
        text: ORCHESTRATOR_PROMPT,
      });
      if (borrowed) borrowedDisposers.push(disposeRolePrompt);
      registerTool(
        defineTool({
          name: 'memory_switch_branch',
          description:
            'Switch this PersonaBot Memory Repository to an existing, accepted local Git branch. Use for a clear Human branch-switch request; do not create or reset branches.',
          parameters: {
            branch: {
              type: 'string',
              required: true,
              description: 'Exact existing local branch name.',
            },
          },
          output: {
            schema: { type: 'string' },
            render: (_args, value) => [{ type: 'text', text: value }],
          },
          execute: async (args) => {
            const active = this.#runs.get(run.sessionId);
            if (active?.role !== 'orchestrator') {
              throw new Error('memory_switch_branch: Orchestrator run is unavailable');
            }
            if (active.run.memory === undefined) throw new Error('Memory is unavailable');
            await active.run.channels.send({ body: `正在切换记忆分支：${args.branch}` });
            try {
              const result = active.run.memory.switchBranch(args.branch);
              await active.run.channels.send({
                body: `记忆分支已从 ${result.from} 切换到 ${result.to}（${result.head.slice(0, 12)}）。`,
              });
              return JSON.stringify({ outcome: 'switched', ...result });
            } catch (error) {
              const detail = error instanceof Error ? error.message : String(error);
              const blocked =
                error instanceof MemoryAcceptError && error.code === 'memory-conflict';
              const workingAssignments = blocked
                ? active.run.assignments
                    .list()
                    .filter((assignment) => assignment.activity === 'working')
                    .map((assignment) => ({
                      sessionId: assignment.sessionId,
                      purpose: assignment.purpose,
                      workspace: assignment.permission?.primaryCwd,
                    }))
                : [];
              await active.run.channels.send({
                body: blocked
                  ? `记忆分支 ${args.branch} 尚未切换：${detail}。当前分支与未完成改动已保留。`
                  : `记忆分支 ${args.branch} 切换失败：${detail}`,
              });
              return JSON.stringify({
                outcome: blocked ? 'blocked' : 'failed',
                branch: args.branch,
                detail,
                workingAssignments,
              });
            }
          },
        }),
      );
      registerTool(
        defineTool({
          name: 'memory_continue_from_commit',
          description:
            'Create and switch to a new local Memory Git branch at an exact historical commit chosen by the Human. The branch name must be new. A pending raw commit stays unaccepted.',
          parameters: {
            sha: {
              type: 'string',
              required: true,
              description: 'Full 40-character Git commit SHA.',
            },
            branch: {
              type: 'string',
              required: true,
              description: 'New local Git branch name chosen by the Human.',
            },
          },
          output: {
            schema: { type: 'string' },
            render: (_args, value) => [{ type: 'text', text: value }],
          },
          execute: async (args) => {
            const active = this.#runs.get(run.sessionId);
            if (active?.role !== 'orchestrator') {
              throw new Error('memory_continue_from_commit: Orchestrator run is unavailable');
            }
            if (active.run.memory === undefined) throw new Error('Memory is unavailable');
            await active.run.channels.send({
              body: '正在从提交 ' + args.sha.slice(0, 12) + ' 创建记忆分支：' + args.branch,
            });
            try {
              const result = active.run.memory.continueFromCommit(args.sha, args.branch);
              await active.run.channels.send({
                body: result.accepted
                  ? '已从提交 ' + result.head.slice(0, 12) + ' 创建并切换到分支 ' + result.to + '。'
                  : '已创建并切换到分支 ' +
                    result.to +
                    '，但起点提交尚未验收；当前记忆需要修复，不能自动接受。',
              });
              return JSON.stringify({ outcome: 'created', ...result });
            } catch (error) {
              const detail = error instanceof Error ? error.message : String(error);
              await active.run.channels.send({ body: '从历史提交继续失败：' + detail });
              return JSON.stringify({
                outcome: 'failed',
                sha: args.sha,
                branch: args.branch,
                detail,
              });
            }
          },
        }),
      );
      registerTool(
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
            grant_id: {
              type: 'string',
              required: true,
              description:
                'Active Workspace Grant id from list_workspace_grants; raw paths are not accepted.',
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
              grantId: args.grant_id,
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
      registerTool(
        defineTool({
          name: 'request_workspace_grant',
          description:
            'Ask the Human in this PersonaBot DM to authorize a folder so the current task can continue. Use only when no active Workspace Grant fits; this does not create an Assignment.',
          parameters: {
            reason: {
              type: 'string',
              required: true,
              description: 'Briefly explain which work needs folder access.',
            },
          },
          output: {
            schema: { type: 'string' },
            render: (_args, value) => [{ type: 'text', text: value }],
          },
          execute: async (args) => {
            const active = this.#runs.get(run.sessionId);
            if (active?.role !== 'orchestrator') {
              throw new Error('request_workspace_grant: Orchestrator run is unavailable');
            }
            const message = await active.run.channels.requestGrant(args.reason);
            return `Sent Workspace Grant request card ${message.id}; wait for Human authorization.`;
          },
        }),
      );
      registerTool(
        defineTool({
          name: 'list_workspace_grants',
          description:
            'List Human-authorized Workspace Grants for this PersonaBot. Only active Grant ids can be passed to create_assignment.',
          parameters: {},
          output: {
            schema: { type: 'string' },
            render: (_args, value) => [{ type: 'text', text: value }],
          },
          execute: async () => {
            const active = this.#runs.get(run.sessionId);
            if (active?.role !== 'orchestrator') {
              throw new Error('list_workspace_grants: Orchestrator run is unavailable');
            }
            return JSON.stringify(active.run.assignments.grants());
          },
        }),
      );
      registerTool(
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
      registerTool(
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
      registerTool(
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
      registerTool(
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
      registerTool(
        defineTool({
          name: 'channel_read_image',
          description:
            'Inspect one image attached to a Channel message this PersonaBot has joined. Pass channel_id, message_id, and the opaque sha256 hash returned by channel_read. This returns the image itself without exposing a Host filesystem path.',
          parameters: {
            channel_id: {
              type: 'string',
              description: 'Channel id; defaults to the inbound Channel.',
            },
            message_id: {
              type: 'string',
              required: true,
              description: 'Owning Channel message id returned by channel_read.',
            },
            hash: {
              type: 'string',
              required: true,
              description: 'Opaque sha256 attachment hash returned by channel_read.',
            },
          },
          output: {
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                channelId: { type: 'string', required: true },
                messageId: { type: 'string', required: true },
                hash: { type: 'string', required: true },
                image: {
                  type: 'object',
                  additionalProperties: false,
                  required: true,
                  properties: {
                    attachmentId: { type: 'string', required: true },
                    mediaType: {
                      type: 'string',
                      enum: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
                      required: true,
                    },
                    bytes: { type: 'integer', required: true },
                    width: { type: 'integer', required: true },
                    height: { type: 'integer', required: true },
                    name: { type: 'string' },
                    originalDimensions: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        width: { type: 'integer', required: true },
                        height: { type: 'integer', required: true },
                      },
                    },
                  },
                },
              },
            },
            render: (_args, value) => {
              const image = value.image;
              return [
                {
                  type: 'text',
                  text: `Channel image ${value.hash} from message ${value.messageId}`,
                },
                {
                  type: 'image',
                  attachment: {
                    attachmentId: AttachmentId(image.attachmentId),
                    mediaType: image.mediaType,
                    bytes: image.bytes,
                    width: image.width,
                    height: image.height,
                    ...(image.name === undefined ? {} : { name: image.name }),
                    ...(image.originalDimensions === undefined
                      ? {}
                      : { originalDimensions: { ...image.originalDimensions } }),
                  },
                },
              ];
            },
          },
          execute: async (args, exec) => {
            const active = this.#runs.get(run.sessionId);
            if (active?.role !== 'orchestrator') {
              throw new Error('channel_read_image: Orchestrator run is unavailable');
            }
            const access = active.run.channels.readAttachment;
            if (access === undefined) {
              throw new Error('channel_read_image: Channel attachment access is unavailable');
            }
            const hostAttachments = agentCtx.get('attachments');
            if (hostAttachments === undefined) {
              throw new Error('channel_read_image: DSH attachment service is unavailable');
            }
            const maxBytes = Math.min(
              hostAttachments.imageLimits.maxImageBytes,
              hostAttachments.imageLimits.maxMessageImageBytes,
            );
            const result = await access({
              ...(args.channel_id === undefined ? {} : { channelId: args.channel_id }),
              messageId: args.message_id,
              hash: args.hash,
              maxBytes,
              signal: exec.signal,
            });
            if (!CHANNEL_IMAGE_MEDIA_TYPES.includes(result.ref.mime as ImageMediaType)) {
              throw new Error(
                `channel_read_image: ${result.ref.mime} is not a supported model image type`,
              );
            }
            const image = await hostAttachments.saveImage({
              data: result.data,
              mediaType: result.ref.mime as ImageMediaType,
              name: result.ref.name,
            });
            return {
              channelId: args.channel_id ?? active.run.inboundChannelId,
              messageId: args.message_id,
              hash: result.ref.hash,
              image,
            };
          },
        }),
      );
      registerTool(
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
      registerTool(
        defineTool({
          name: 'channel_send',
          description:
            'Send one Human-facing message as this PersonaBot to a Channel it has joined. Omit channel_id to use the Channel that triggered the current turn.',
          parameters: {
            body: {
              type: 'string',
              required: true,
              description: 'Message body; may be empty when attachments are present.',
            },
            attachments: {
              type: 'array',
              description: 'Optional references returned by Channel attachment uploads or reads.',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  hash: { type: 'string', required: true },
                  name: { type: 'string', required: true },
                  mime: { type: 'string', required: true },
                  size: { type: 'number', required: true },
                },
              },
            },
            channel_id: {
              type: 'string',
              description: 'Channel id; defaults to the inbound Channel.',
            },
            reply_to: {
              type: 'string',
              description: 'Optional message id to reply to in that same Channel.',
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
              ...(args.attachments === undefined ? {} : { attachments: args.attachments }),
              ...(args.channel_id === undefined ? {} : { channelId: args.channel_id }),
              ...(args.reply_to === undefined ? {} : { replyTo: args.reply_to }),
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
    const live = this.#agents.get?.(SessionId(run.sessionId));
    if (live !== undefined) {
      this.#authorizeBorrow?.(live, 'orchestrator');
      try {
        await setup(live.ctx, live, true);
      } catch (error) {
        for (const dispose of borrowedDisposers.reverse()) dispose();
        throw error;
      }
      const borrowed: AgentHandle = {
        agent: live,
        dispose: async () => {
          for (const dispose of borrowedDisposers.reverse()) dispose();
        },
      };
      this.#handles.set(run.sessionId, borrowed);
      return borrowed;
    }
    const options = { agentOptions: resolvedAgentOptions, setup };
    const meta = createMeta(
      run,
      this.#resolveOrchestratorCwd(run.bot),
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

  #resolveOrchestratorCwd(bot: PersonaBotRecord): string {
    const cwd = this.#orchestratorCwd?.(bot);
    if (cwd === undefined) {
      throw new Error(`Memory workspace unavailable for Orchestrator ${bot.slug}`);
    }
    return cwd;
  }

  async #assignmentHandle(run: AssignmentAgentRun): Promise<AgentHandle> {
    const existing = this.#handles.get(run.sessionId);
    if (existing !== undefined) return existing;
    const meta = createMeta(run, run.permission.primaryCwd, undefined, this.#defaultAgentPreset);
    const resolvedAgentOptions = agentOptions(run, this.#defaultModel.currentSelection());
    const borrowedDisposers: Array<() => void> = [];
    const createOptions: CreateAgentOptions = {
      sessionId: SessionId(run.sessionId),
      ...(meta === undefined ? {} : { meta }),
      agentOptions: resolvedAgentOptions,
      setup: async (agentCtx, agent, borrowed = false) => {
        if (agent.session.header.cwd !== run.permission.primaryCwd) {
          throw new Error('Assignment Session cwd differs from its Workspace Grant snapshot');
        }
        setSandboxMode(agent.session, run.permission.mode);
        setApprovalPolicy(agent.session, run.permission.approval);
        if (!borrowed) {
          await this.#composePreset(agentCtx, run.bot);
          installModelSelection(agentCtx, { current: resolvedAgentOptions, assembled: undefined });
        }
        const registerTool = (tool: Parameters<typeof agentCtx.tools.register>[0]) => {
          const dispose = agentCtx.tools.register(tool);
          if (borrowed) borrowedDisposers.push(dispose);
          return dispose;
        };
        const disposePresentation = agentCtx.tools.presentAs('native');
        if (borrowed) borrowedDisposers.push(disposePresentation);
        const disposeRolePrompt = agentCtx.systemPrompt.section({
          name: 'botharness:assignment-role',
          order: ROLE_PROMPT_ORDER,
          text:
            run.permission.mode === 'danger-full-access'
              ? DANGER_ASSIGNMENT_PROMPT
              : ASSIGNMENT_PROMPT,
        });
        if (borrowed) borrowedDisposers.push(disposeRolePrompt);
        registerTool(
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
    const live = this.#agents.get?.(SessionId(run.sessionId));
    if (live !== undefined) {
      this.#authorizeBorrow?.(live, 'assignment');
      try {
        await (
          createOptions.setup as (ctx: Context, agent: Agent, borrowed: boolean) => Promise<void>
        )(live.ctx, live, true);
      } catch (error) {
        for (const dispose of borrowedDisposers.reverse()) dispose();
        throw error;
      }
      const borrowed: AgentHandle = {
        agent: live,
        dispose: async () => {
          for (const dispose of borrowedDisposers.reverse()) dispose();
        },
      };
      this.#handles.set(run.sessionId, borrowed);
      return borrowed;
    }
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
