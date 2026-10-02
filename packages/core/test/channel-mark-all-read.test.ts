import { expect, it } from 'vitest';
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
it('marks captured Human Channel heads read, preserves requests and leaves later arrivals unread', async () => {
  const home = createTempRoot('bh-overview-read-');
  let core = createCore({ dshHome: home, agents });
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
    const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
    const hidden = core.channels.getOrCreateBotDm('ada', 'bea', 'Private')!;
    for (const channel of [dm, group, hidden])
      await core.channels.appendMessage(channel.id, {
        id: 'head-' + channel.id,
        ...(channel.id === hidden.id
          ? {
              botCausation: {
                rootSourceEventId: 'qa-root',
                parentSourceEventId: 'qa-parent',
                hop: 1,
              },
            }
          : {}),
        author: { kind: 'bot', slug: 'ada' },
        body: 'Update',
        at: new Date().toISOString(),
      });
    await core.channels.appendMessage(dm.id, {
      id: 'grant-request',
      author: { kind: 'bot', slug: 'ada' },
      body: 'Choose workspace',
      grantRequest: true,
      at: new Date().toISOString(),
    });
    const requests = core.humanAttention.actionCount();
    expect(requests).toBe(1);
    const original = core.channels.markRead.bind(core.channels);
    let injected = false;
    core.channels.markRead = async (channelId, messageId) => {
      if (!injected) {
        injected = true;
        await core.channels.appendMessage(group.id, {
          id: 'late',
          author: { kind: 'bot', slug: 'ada' },
          body: 'Late update',
          at: new Date().toISOString(),
        });
      }
      return original(channelId, messageId);
    };
    const result = await createBridgeMethods({ ...core }).channelMarkAllRead({});
    expect(result).toEqual({ ok: true, value: { channels: 2 } });
    expect(core.channels.readPosition(dm.id)?.messageId).toBe('grant-request');
    expect(core.channels.readPosition(group.id)?.messageId).toBe('head-' + group.id);
    expect(core.channels.readPosition(hidden.id)).toBeUndefined();
    expect(core.humanAttention.actionCount()).toBe(requests);
    expect(core.humanAttention.status().unreadCount).toBe(1);
    await core.runtime.close();
    core.operationalDatabase.close();
    core = createCore({ dshHome: home, agents });
    expect(core.humanAttention.status().unreadCount).toBe(1);
    expect(core.humanAttention.actionCount()).toBe(1);
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});
