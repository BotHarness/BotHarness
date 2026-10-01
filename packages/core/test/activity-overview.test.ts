import type { Agent } from '@deepseek-ai/dsh-agent';
import { describe, expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createTempRoot } from './helpers.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
const agents: BotAgentAdapter = {
  async runOrchestrator() {},
  async runAssignment() {},
  async close() {},
  requestAssignment() {
    throw new Error('Unexpected Assignment');
  },
};
describe('Activity Center Host query', () => {
  it('counts all explicit actions beyond one page without counting unread or mentions', async () => {
    const core = createCore({ dshHome: createTempRoot('bh-overview-'), agents });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      for (let i = 0; i < 61; i++)
        await core.channels.appendMessage(dm.id, {
          id: 'grant-' + i,
          at: '2026-10-01T09:00:00Z',
          author: { kind: 'bot', slug: 'ada' },
          body: 'Choose workspace',
          grantRequest: true,
        });
      await core.channels.appendMessage(dm.id, {
        id: 'ordinary',
        at: '2026-10-01T09:00:01Z',
        author: { kind: 'bot', slug: 'ada' },
        body: 'Status update',
      });
      const methods = createBridgeMethods({ ...core });
      expect(methods.activityOverview({})).toMatchObject({
        ok: true,
        value: { actionCount: 61, bots: [{ slug: 'ada', state: 'idle', sessions: [] }] },
      });
      expect(core.humanAttention.status()).toEqual({ unreadCount: 62, hasAction: true });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});

it('shows only live executing roots and follows execution changes without reviving them after restart', async () => {
  const home = createTempRoot('bh-overview-executing-');
  const core = createCore({ dshHome: home, agents });
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    core.registry.create({ slug: 'bea', displayName: 'Bea' });
    for (const [sessionId, rootRole, parentSessionId] of [
      ['orch', 'orchestrator', undefined],
      ['assignment', 'assignment', undefined],
      ['child', 'assignment', 'assignment'],
      ['waiting', 'assignment', undefined],
      ['stale', 'orchestrator', undefined],
    ] as const)
      core.ownership.claim({
        sessionId,
        botSlug: 'ada',
        rootRole,
        ...(parentSessionId === undefined ? {} : { parentSessionId }),
        at: '2026-10-01T09:00:00Z',
      });
    for (const [id, state] of [
      ['orch', 'thinking'],
      ['assignment', 'working'],
      ['child', 'working'],
      ['waiting', 'waiting'],
      ['stale', 'thinking'],
    ] as const)
      core.states.setSessionState('ada', id, state);
    const live = new Set(['orch', 'assignment', 'child', 'waiting']);
    const methods = createBridgeMethods({ ...core, isSessionRunning: (id) => live.has(id) });
    expect(methods.activityOverview({})).toMatchObject({
      ok: true,
      value: {
        actionCount: 0,
        bots: [
          {
            slug: 'ada',
            state: 'waiting',
            sessions: [
              { sessionId: 'orch', role: 'orchestrator', state: 'thinking' },
              { sessionId: 'assignment', role: 'assignment', state: 'working' },
            ],
          },
          { slug: 'bea', state: 'idle', sessions: [] },
        ],
      },
    });
    core.states.setSessionState('ada', 'orch', 'done');
    live.delete('assignment');
    expect(methods.activityOverview({})).toMatchObject({
      ok: true,
      value: {
        bots: [
          { slug: 'ada', sessions: [] },
          { slug: 'bea', sessions: [] },
        ],
      },
    });
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
  const restored = createCore({ dshHome: home, agents });
  try {
    expect(
      createBridgeMethods({ ...restored, isSessionRunning: () => false }).activityOverview({}),
    ).toMatchObject({
      ok: true,
      value: {
        bots: [
          { slug: 'ada', state: 'idle', sessions: [] },
          { slug: 'bea', state: 'idle', sessions: [] },
        ],
      },
    });
  } finally {
    await restored.runtime.close();
    restored.operationalDatabase.close();
  }
});

it('keeps a real pending question in actions while excluding its waiting Session from execution', async () => {
  const { ChannelUserQuestions } = await import('../src/channels/user-questions.js');
  const core = createCore({
    dshHome: createTempRoot('bh-overview-question-'),
    agents,
    activeQuestionMessageIds: () => broker.activeMessageIds(),
  });
  const broker = new ChannelUserQuestions(core.channels, core.ownership);
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    core.channels.getOrCreateDm('ada', 'Ada');
    core.ownership.claim({
      sessionId: 'orch',
      botSlug: 'ada',
      rootRole: 'orchestrator',
      at: '2026-10-01T09:00:00Z',
    });
    core.states.setSessionState('ada', 'orch', 'working');

    const answer = broker.ask({
      agent: { session: { id: 'orch', header: { cwd: '/qa' } } } as Agent,
      questions: [{ id: 'route', question: 'Which route?' }],
    });
    void answer.catch(() => undefined);
    const methods = createBridgeMethods({
      ...core,
      userQuestions: broker,
      isSessionRunning: () => true,
    });
    const { vi } = await import('vitest');
    await vi.waitFor(() =>
      expect(methods.activityOverview({})).toMatchObject({
        ok: true,
        value: { actionCount: 1, bots: [{ slug: 'ada', state: 'waiting', sessions: [] }] },
      }),
    );
    broker.close();
    await vi.waitFor(() => expect(core.humanAttention.actionCount()).toBe(0));
  } finally {
    broker.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});
