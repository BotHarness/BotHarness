import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { Agent } from '@deepseek-ai/dsh-agent';

import { createChannelStore } from '../src/channels/store.js';
import { ChannelUserQuestions } from '../src/channels/user-questions.js';
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
  const answerer = new ChannelUserQuestions(
    channels,
    ownership,
    (candidate) => candidate === agent && live,
    warn,
  );
  return {
    channels,
    ownership,
    agent,
    answerer,
    warn,
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
    await vi.waitFor(() => expect(state.channels.readMessages(channelId)).toHaveLength(2));
    expect(
      state.channels
        .readMessages(channelId)
        .find((item) => item.userQuestionResolution !== undefined)?.userQuestionResolution?.state,
    ).toBe('cancelled');
    expect(state.answerer.status('ada', request.id)).toBe('expired');
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
  });
});
