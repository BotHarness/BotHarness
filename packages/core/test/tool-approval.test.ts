import { describe, expect, it, vi } from 'vitest';

import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';

import type { ChannelMessage, ChannelRecord } from '../src/channels/channel.js';
import type { ChannelStore } from '../src/channels/store.js';
import type { SessionOwnership } from '../src/sessions/ownership.js';
import { ChannelToolApproval } from '../src/workspaces/tool-approval.js';

const botSlug = 'ada';
const sessionId = 'botharness-assignment-test';
const channelId = 'dm-ada';

function fixture() {
  const messages: ChannelMessage[] = [];
  const channel = { id: channelId, type: 'dm', botSlug } as ChannelRecord;
  const channels = {
    get: vi.fn((id: string) => (id === channelId ? channel : undefined)),
    appendMessage: vi.fn(async (id: string, message: ChannelMessage) => {
      if (id !== channelId) return undefined;
      messages.push(message);
      return message;
    }),
  } as unknown as ChannelStore;
  const ownership = {
    resolve: vi.fn((id: string) =>
      id === sessionId ? { sessionId, botSlug, rootRole: 'assignment' as const } : undefined,
    ),
  } as unknown as SessionOwnership;
  const agent = { session: { id: sessionId, header: { cwd: '/tmp/project' } } } as Agent;
  const broker = new ChannelToolApproval(channels, ownership);
  const execution = (signal?: AbortSignal): ToolExecution =>
    ({
      agent,
      name: 'bash',
      callId: 'call-1',
      arguments: { command: 'pwd && ls' },
      token: Symbol('call'),
      signal,
    }) as ToolExecution;
  return { broker, channels, ownership, messages, agent, execution };
}

describe('Channel tool approval', () => {
  it('keeps one native tool call paused until a Human decision is committed', async () => {
    const state = fixture();
    const untrack = state.broker.track(state.execution());
    expect(untrack).toBeTypeOf('function');
    const answer = state.broker.ask({ agent: state.agent, toolName: 'bash', callId: 'call-1' });
    await vi.waitFor(() => expect(state.messages).toHaveLength(1));
    const request = state.messages[0]!;
    expect(request.toolApprovalRequest).toMatchObject({
      sessionId,
      toolName: 'bash',
      role: 'assignment',
      cwd: '/tmp/project',
      input: '{\n  "command": "pwd && ls"\n}',
    });
    expect(state.broker.status(botSlug, request.id)).toBe('pending');
    expect(await state.broker.decide('other-bot', request.id, 'allowed-once')).toBe(false);
    expect(state.messages).toHaveLength(1);
    expect(await state.broker.decide(botSlug, request.id, 'allowed-once')).toBe(true);
    expect(await answer).toBe('allowed-once');
    expect(state.messages[1]?.toolApprovalDecision).toEqual({
      requestMessageId: request.id,
      outcome: 'allowed-once',
    });
    expect(state.broker.status(botSlug, request.id)).toBe('expired');
    expect(await state.broker.decide(botSlug, request.id, 'allowed-once')).toBe(false);
    untrack?.();
  });

  it('records a rejection and leaves the native call denied', async () => {
    const state = fixture();
    const untrack = state.broker.track(state.execution());
    const answer = state.broker.ask({ agent: state.agent, toolName: 'bash', callId: 'call-1' });
    await vi.waitFor(() => expect(state.messages).toHaveLength(1));
    const requestId = state.messages[0]!.id;
    expect(await state.broker.decide(botSlug, requestId, 'rejected')).toBe(true);
    expect(await answer).toBe('rejected');
    expect(state.messages[1]?.toolApprovalDecision).toEqual({
      requestMessageId: requestId,
      outcome: 'rejected',
    });
    untrack?.();
  });

  it('cancels a pending approval with the original tool signal', async () => {
    const state = fixture();
    const controller = new AbortController();
    const untrack = state.broker.track(state.execution(controller.signal));
    const answer = state.broker.ask({
      agent: state.agent,
      toolName: 'bash',
      callId: 'call-1',
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(state.messages).toHaveLength(1));
    controller.abort();
    expect(await answer).toBe('cancelled');
    expect(state.broker.status(botSlug, state.messages[0]!.id)).toBe('expired');
    expect(await state.broker.decide(botSlug, state.messages[0]!.id, 'allowed-once')).toBe(false);
    untrack?.();
  });

  it('uses a Human-saved exact rule for later calls and loses it after revoke', async () => {
    const state = fixture();
    let active = true;
    const rules = {
      match: vi.fn((input: { toolName: string; input: string }) =>
        active && input.toolName === 'bash' && input.input.includes('pwd')
          ? { id: 'rule-1' }
          : undefined,
      ),
      createPending: vi.fn(),
      activate: vi.fn(),
      revoke: vi.fn(),
      list: vi.fn(),
    } as unknown as import('../src/workspaces/tool-approval-rules.js').ToolApprovalRuleStore;
    const broker = new ChannelToolApproval(state.channels, state.ownership, rules);
    broker.track(state.execution());
    expect(await broker.ask({ agent: state.agent, toolName: 'bash', callId: 'call-1' })).toBe(
      'allowed-once',
    );
    expect(broker.validAfterDecision(state.agent, 'call-1')).toBe(true);
    expect(state.messages).toHaveLength(0);
    active = false;
    expect(broker.validAfterDecision(state.agent, 'call-1')).toBe(false);
    broker.close();
  });

  it('declines requests that do not match the exact tracked Agent and tool', async () => {
    const state = fixture();
    state.broker.track(state.execution());
    const otherAgent = { session: { id: sessionId, header: { cwd: '/tmp/project' } } } as Agent;
    expect(
      await state.broker.ask({ agent: otherAgent, toolName: 'bash', callId: 'call-1' }),
    ).toBeUndefined();
    expect(
      await state.broker.ask({ agent: state.agent, toolName: 'write', callId: 'call-1' }),
    ).toBeUndefined();
    expect(state.messages).toHaveLength(0);
    state.broker.close();
  });
});
