import type { Context } from '@deepseek-ai/cordis';
import type {
  Agent,
  AgentHandle,
  CreateAgentOptions,
  ResumeAgentOptions,
} from '@deepseek-ai/dsh-agent';
import { createAssistantMessage, type Message, type UserMessage } from '@deepseek-ai/dsh-llm';
import type { TurnEndReason } from '@deepseek-ai/dsh-session';
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';

import type { PersonaBotRecord } from '../src/bots/persona-bot.js';
import type { DshAgentHost } from '../src/runtime/dsh-bot-agent-adapter.js';

export interface FakeSession {
  id: string;
  header: { cwd?: string; createdAt: number };
  seq: number;
  append(type: string, data: unknown): void;
  snapshotEvents(
    fromSeq?: number,
    toSeqExclusive?: number,
  ): readonly {
    type: string;
    seq: number;
    time: number;
    data: unknown;
  }[];
}

export interface FakeAgentHostHooks {
  /** Mirrors DSH's `agent/created` so a Host wiring can be driven end to end. */
  onAgentCreated?(agent: unknown): void;
  /** Mirrors DSH's `session/event` firehose for every appended event. */
  onSessionEvent?(
    session: FakeSession,
    event: { type: string; seq: number; time: number; data: unknown },
  ): void;
}

interface FakeScope {
  tools: ToolDefinition[];
  sections: Array<{ name: string; text: string }>;
}

interface FakeEvent {
  type: string;
  seq: number;
  time: number;
  data: unknown;
}

/** Minimal DSH Agent host double that drives one deterministic turn per session. */
export class FakeAgentHost implements DshAgentHost {
  readonly createOptions: CreateAgentOptions[] = [];
  readonly resumeOptions: ResumeAgentOptions[] = [];
  readonly disposed: string[] = [];
  readonly scopes = new Map<string, FakeScope>();
  readonly sessions: FakeSession[] = [];
  readonly #cwdBySession = new Map<string, string | undefined>();

  constructor(
    private readonly orchestratorTurnEnd: TurnEndReason = { kind: 'completed' },
    private readonly hooks: FakeAgentHostHooks = {},
  ) {}

  async create(options: CreateAgentOptions): Promise<AgentHandle> {
    this.createOptions.push(options);
    const sessionId = String(options.sessionId);
    this.#cwdBySession.set(sessionId, options.meta?.cwd);
    return this.#start(sessionId, options.meta?.cwd, options.setup);
  }

  async resume(options: ResumeAgentOptions): Promise<AgentHandle> {
    this.resumeOptions.push(options);
    const sessionId = String(options.resumeSessionId);
    return this.#start(sessionId, this.#cwdBySession.get(sessionId), options.setup);
  }

  async #start(
    sessionId: string,
    cwd: string | undefined,
    setup: CreateAgentOptions['setup'] | ResumeAgentOptions['setup'],
  ): Promise<AgentHandle> {
    const scope: FakeScope = { tools: [], sections: [] };
    const messages: Message[] = [];
    const events: FakeEvent[] = [];
    const session: FakeSession = {
      id: sessionId,
      header: {
        ...(cwd === undefined ? {} : { cwd }),
        createdAt: Date.parse('2026-09-21T00:00:00.000Z'),
      },
      get seq() {
        return events.length;
      },
      append: (type, data) =>
        this.#emit(session, events, {
          type,
          data,
          seq: events.length,
          time: session.header.createdAt,
        }),
      snapshotEvents: (fromSeq = 0, toSeqExclusive = events.length) =>
        events.slice(fromSeq, toSeqExclusive),
    };
    let pending = Promise.resolve();
    const fakeAgent = {
      id: sessionId,
      session,
      followup: (message: UserMessage) => {
        messages.push(message);
        const isOrchestrator = scope.tools.some((tool) => tool.name === 'create_assignment');
        const reason = isOrchestrator ? this.orchestratorTurnEnd : { kind: 'completed' as const };
        pending = (reason.kind === 'error' ? Promise.resolve() : this.#drive(scope, messages)).then(
          () => {
            this.#emit(session, events, {
              type: 'turn/end',
              seq: events.length,
              time: session.header.createdAt,
              data: { turn: events.length + 1, reason },
            });
          },
        );
      },
      whenIdle: () => pending,
    };
    const fakeContext = {
      on: () => () => undefined,
      tools: { register: (tool: ToolDefinition) => void scope.tools.push(tool) },
      systemPrompt: {
        section: (section: { name: string; text: string }) => void scope.sections.push(section),
      },
    };
    await setup?.(fakeContext as unknown as Context, fakeAgent as unknown as Agent);
    this.scopes.set(sessionId, scope);
    this.sessions.push(session);
    this.hooks.onAgentCreated?.(fakeAgent);
    return {
      agent: fakeAgent as unknown as Agent,
      dispose: async () => void this.disposed.push(sessionId),
    };
  }

  #emit(session: FakeSession, events: FakeEvent[], event: FakeEvent): void {
    events.push(event);
    this.hooks.onSessionEvent?.(session, event);
  }

  async #drive(scope: FakeScope, messages: Message[]): Promise<void> {
    const createAssignment = scope.tools.find((tool) => tool.name === 'create_assignment');
    if (createAssignment !== undefined) {
      await createAssignment.execute(
        { purpose: '核对发布状态', grant_id: 'grant-1' },
        {} as ToolRunContext,
      );
      const channelSend = scope.tools.find((tool) => tool.name === 'channel_send');
      await channelSend?.execute({ body: '发布状态已经核对完成。' }, {} as ToolRunContext);
      messages.push(
        createAssistantMessage({
          content: [{ type: 'text', text: 'private Orchestrator final' }],
          source: { provider: 'test', model: 'test' },
        }),
      );
      return;
    }
    const report = scope.tools.find((tool) => tool.name === 'report_to_orchestrator');
    await report?.execute({ state: 'completed', summary: '发布状态正常' }, {} as ToolRunContext);
  }
}

export const FAKE_BOT: PersonaBotRecord = {
  slug: 'ada',
  displayName: 'Ada',
  roles: [],
  workspaces: [],
  createdAt: '2026-09-21T00:00:00.000Z',
};
