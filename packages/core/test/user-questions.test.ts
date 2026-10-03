import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { Agent } from '@deepseek-ai/dsh-agent';

import { createChannelStore } from '../src/channels/store.js';
import { ChannelUserQuestions } from '../src/channels/user-questions.js';
import { createBotStateTracker } from '../src/state/bot-state.js';
import { createTempRoot, createTestOwnership } from './helpers.js';

const sessionId = 'botharness-orchestrator-question-test';
const channelId = 'dm-ada';
const questions = [
  {
    id: 'memory-branch',
    question: 'Which Memory branch should I switch to?',
    options: [
      { label: 'main', description: 'Current branch' },
      { label: 'history-qa', description: 'Earlier memory' },
    ],
  },
];

function fixture(role: 'orchestrator' | 'assignment' = 'orchestrator') {
  const channels = createChannelStore({
    rootDir: join(createTempRoot('bh-question-'), 'channels'),
  });
  channels.getOrCreateDm('ada', 'Ada');
  const ownership = createTestOwnership({ [sessionId]: { botSlug: 'ada', rootRole: role } });
  const agent = { session: { id: sessionId, header: { cwd: '/tmp/memory' } } } as Agent;
  let live = true;
  const warn = vi.fn();
  const states = createBotStateTracker();
  states.setSessionState('ada', sessionId, 'working', undefined, 'orchestrator');
  const answerer = new ChannelUserQuestions(
    channels,
    ownership,
    (candidate) => candidate === agent && live,
    warn,
    (slug, count) => states.setQuestionCount(slug, count),
  );
  return {
    channels,
    ownership,
    agent,
    answerer,
    warn,
    states,
    setLive: (value: boolean) => {
      live = value;
    },
  };
}

describe('native DSH questions in a PersonaBot DM', () => {
  it('commits a card, validates the Human answer, and resumes the same waiting request', async () => {
    const state = fixture();
    const wait = state.answerer.ask({ agent: state.agent, questions });
    await vi.waitFor(() => expect(state.channels.readMessages(channelId)).toHaveLength(1));
    const request = state.channels.readMessages(channelId)[0]!;
    expect(request.userQuestionRequest).toEqual({ sessionId, questions });
    expect(state.answerer.status('ada', request.id)).toBe('pending');
    expect(state.states.snapshot('ada')).toMatchObject({
      state: 'working',
      attention: { approvalCount: 0, questionCount: 1 },
    });
    expect(state.answerer.activeMessageIds()).toEqual([request.id]);
    expect(
      await state.answerer.answer('other-bot', request.id, {
        answers: [{ id: 'memory-branch', selected: ['history-qa'] }],
      }),
    ).toBe(false);
    expect(
      await state.answerer.answer('ada', request.id, {
        answers: [{ id: 'memory-branch', selected: ['unoffered'] }],
      }),
    ).toBe(false);
    const expected = { answers: [{ id: 'memory-branch', selected: ['history-qa'] }] };
    expect(await state.answerer.answer('ada', request.id, expected)).toBe(true);
    expect(await wait).toEqual(expected);
    expect(state.states.snapshot('ada').attention).toBeUndefined();
    expect(
      state.channels
        .readMessages(channelId)
        .find((item) => item.userQuestionResolution !== undefined)?.userQuestionResolution,
    ).toEqual({
      requestMessageId: request.id,
      state: 'answered',
      answers: expected.answers,
    });
    expect(state.answerer.status('ada', request.id)).toBe('expired');
    expect(state.answerer.activeMessageIds()).toEqual([]);
    expect(await state.answerer.answer('ada', request.id, expected)).toBe(false);
  });

  it('accepts a free-text answer and prevents a stopped or stale Session from resuming', async () => {
    const state = fixture();
    const controller = new AbortController();
    const wait = state.answerer.ask({ agent: state.agent, questions, signal: controller.signal });
    const rejected = expect(wait).rejects.toThrow(/cancelled/);
    await vi.waitFor(() => expect(state.channels.readMessages(channelId)).toHaveLength(1));
    const request = state.channels.readMessages(channelId)[0]!;
    controller.abort();
    await rejected;
    expect(state.states.snapshot('ada').attention).toBeUndefined();
    await vi.waitFor(() => expect(state.channels.readMessages(channelId)).toHaveLength(2));
    expect(
      state.channels
        .readMessages(channelId)
        .find((item) => item.userQuestionResolution !== undefined)?.userQuestionResolution?.state,
    ).toBe('cancelled');
    expect(state.answerer.status('ada', request.id)).toBe('expired');
    expect(state.answerer.activeMessageIds()).toEqual([]);
    expect(
      await state.answerer.answer('ada', request.id, {
        answers: [{ id: 'memory-branch', selected: [], custom: 'my-history' }],
      }),
    ).toBe(false);
  });

  it('expires a stale live Agent without accepting a late answer', async () => {
    const state = fixture();
    const wait = state.answerer.ask({ agent: state.agent, questions });
    const rejected = expect(wait).rejects.toThrow(/cancelled/);
    await vi.waitFor(() => expect(state.channels.readMessages(channelId)).toHaveLength(1));
    const id = state.channels.readMessages(channelId)[0]!.id;
    state.setLive(false);
    expect(state.answerer.status('ada', id)).toBe('expired');
    expect(
      await state.answerer.answer('ada', id, {
        answers: [{ id: 'memory-branch', selected: ['history-qa'] }],
      }),
    ).toBe(false);
    await rejected;
    expect(state.states.snapshot('ada').attention).toBeUndefined();
    expect(state.answerer.status('ada', id)).toBe('expired');
    await vi.waitFor(() =>
      expect(state.channels.readMessages(channelId)[0]?.userQuestionResolution?.state).toBe(
        'cancelled',
      ),
    );
  });

  it('keeps cancellation final when a Session stops during answer persistence', async () => {
    const state = fixture();
    const controller = new AbortController();
    const wait = state.answerer.ask({ agent: state.agent, questions, signal: controller.signal });
    const rejected = expect(wait).rejects.toThrow(/cancelled/);
    await vi.waitFor(() => expect(state.channels.readMessages(channelId)).toHaveLength(1));
    const id = state.channels.readMessages(channelId)[0]!.id;
    const append = state.channels.appendMessage.bind(state.channels);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(state.channels, 'appendMessage').mockImplementation(async (channel, message) => {
      const saved = await append(channel, message);
      if (message.userQuestionResolution?.state === 'answered') await gate;
      return saved;
    });
    const answer = state.answerer.answer('ada', id, {
      answers: [{ id: 'memory-branch', selected: ['history-qa'] }],
    });
    await vi.waitFor(() =>
      expect(
        state.channels
          .readMessages(channelId)
          .some((item) => item.userQuestionResolution?.state === 'answered'),
      ).toBe(true),
    );
    controller.abort();
    release();
    expect(await answer).toBe(false);
    await rejected;
    expect(state.states.snapshot('ada').attention).toBeUndefined();
    await vi.waitFor(() =>
      expect(state.channels.readMessages(channelId)[0]?.userQuestionResolution?.state).toBe(
        'cancelled',
      ),
    );
  });

  it('leaves Assignment questions to another native answerer', async () => {
    const state = fixture('assignment');
    expect(await state.answerer.ask({ agent: state.agent, questions })).toBeUndefined();
    expect(state.channels.readMessages(channelId)).toHaveLength(0);
  });

  it('allows custom answers but rejects incomplete or fabricated option sets', async () => {
    const state = fixture();
    const wait = state.answerer.ask({ agent: state.agent, questions });
    await vi.waitFor(() => expect(state.channels.readMessages(channelId)).toHaveLength(1));
    const id = state.channels.readMessages(channelId)[0]!.id;
    expect(await state.answerer.answer('ada', id, { answers: [] })).toBe(false);
    expect(
      await state.answerer.answer('ada', id, {
        answers: [{ id: 'memory-branch', selected: ['main', 'history-qa'] }],
      }),
    ).toBe(false);
    expect(
      await state.answerer.answer('ada', id, {
        answers: [{ id: 'memory-branch', selected: ['main'], custom: 'another-branch' }],
      }),
    ).toBe(false);
    const expected = { answers: [{ id: 'memory-branch', selected: [], custom: 'another-branch' }] };
    expect(await state.answerer.answer('ada', id, expected)).toBe(true);
    expect(await wait).toEqual(expected);
    expect(state.states.snapshot('ada').attention).toBeUndefined();
  });
});

describe('live question attention authority', () => {
  it('counts committed requests, combines approvals, and independently clears each source', async () => {
    const state = fixture();
    const original = state.states.snapshot('ada');
    state.states.setApprovalCount('ada', 2);
    const first = state.answerer.ask({ agent: state.agent, questions });
    const second = state.answerer.ask({ agent: state.agent, questions });
    await vi.waitFor(() => expect(state.states.snapshot('ada').attention?.questionCount).toBe(2));
    const ids = state.answerer.activeMessageIds();
    const answer = { answers: [{ id: 'memory-branch', selected: ['main'] }] };
    expect(await state.answerer.answer('ada', ids[0]!, answer)).toBe(true);
    await first;
    expect(state.states.snapshot('ada').attention).toEqual({ approvalCount: 2, questionCount: 1 });
    expect(await state.answerer.answer('ada', ids[1]!, answer)).toBe(true);
    await second;
    expect(state.states.snapshot('ada')).toEqual({ ...original, attention: { approvalCount: 2 } });
    state.states.setApprovalCount('ada', 0);
    expect(state.states.snapshot('ada')).toEqual(original);
    const fresh = new ChannelUserQuestions(state.channels, state.ownership);
    expect(fresh.activeMessageIds()).toEqual([]);
    expect(createBotStateTracker().snapshot('ada').attention).toBeUndefined();
  });

  it('does not publish an uncommitted or failed request, including abort during persistence', async () => {
    const state = fixture();
    let release!: () => void;
    const gate = new Promise<void>((done) => {
      release = done;
    });
    const append = state.channels.appendMessage.bind(state.channels);
    vi.spyOn(state.channels, 'appendMessage').mockImplementation(async (channel, message) => {
      if (message.userQuestionRequest) await gate;
      return append(channel, message);
    });
    const controller = new AbortController();
    const request = state.answerer.ask({
      agent: state.agent,
      questions,
      signal: controller.signal,
    });
    const rejected = expect(request).rejects.toThrow(/cancelled/);
    expect(state.states.snapshot('ada').attention).toBeUndefined();
    controller.abort();
    release();
    await rejected;
    expect(state.states.snapshot('ada').attention).toBeUndefined();
    vi.mocked(state.channels.appendMessage).mockRejectedValueOnce(new Error('storage failed'));
    await expect(state.answerer.ask({ agent: state.agent, questions })).rejects.toThrow(
      'storage failed',
    );
    expect(state.states.snapshot('ada').attention).toBeUndefined();
    expect(state.answerer.activeMessageIds()).toEqual([]);
  });

  it('clears disposed Sessions and close without requiring a query or changing execution', async () => {
    const state = fixture();
    const request = state.answerer.ask({ agent: state.agent, questions });
    const rejected = expect(request).rejects.toThrow(/cancelled/);
    await vi.waitFor(() => expect(state.states.snapshot('ada').attention?.questionCount).toBe(1));
    state.answerer.cancelSession(sessionId);
    await rejected;
    expect(state.states.snapshot('ada').attention).toBeUndefined();
    expect(state.states.snapshot('ada').state).toBe('working');
    const next = state.answerer.ask({ agent: state.agent, questions });
    const closed = expect(next).rejects.toThrow(/cancelled/);
    await vi.waitFor(() => expect(state.states.snapshot('ada').attention?.questionCount).toBe(1));
    state.answerer.close();
    await closed;
    expect(state.states.snapshot('ada').attention).toBeUndefined();
  });
});
