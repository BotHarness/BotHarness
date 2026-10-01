import { expect, it } from 'vitest';
import { createActions } from '../src/client/actions.js';
import { createStore } from '../src/client/store.js';
import type { BridgeCall } from '../src/client/bridge.js';
it('updates only the source Channel and preserves the current conversation when a nickname saves', async () => {
  const source = {
    id: 'group-a',
    type: 'group' as const,
    name: 'A',
    members: ['ada'],
    createdAt: '',
    updatedAt: '',
    humanNickname: null,
    humanMembers: [{ humanId: 'local-human', displayName: 'Little Bear' }],
  };
  const other = {
    ...source,
    id: 'dm-ada',
    type: 'dm' as const,
    name: 'Ada',
    botSlug: 'ada',
    humanNickname: 'Captain',
    humanMembers: [{ humanId: 'local-human', displayName: 'Captain' }],
  };
  const clientStore = createStore();
  clientStore.upsertChannel(source);
  clientStore.upsertChannel(other);
  clientStore.setConversation({ channel: other });
  const call: BridgeCall = async (endpoint, payload) => {
    expect(endpoint).toBe('channelHumanNameSet');
    expect(payload).toEqual({ channelId: source.id, nickname: 'Professor' });
    return {
      ok: true,
      value: {
        channel: {
          ...source,
          humanNickname: 'Professor',
          humanMembers: [{ humanId: 'local-human', displayName: 'Professor' }],
        },
      },
    };
  };
  expect(await createActions(call, clientStore).setHumanNickname(source.id, 'Professor')).toBe(
    true,
  );
  expect(clientStore.getSnapshot().channels.find((c) => c.id === source.id)?.humanNickname).toBe(
    'Professor',
  );
  expect(clientStore.getSnapshot().conversation.channel?.humanMembers?.[0]?.displayName).toBe(
    'Captain',
  );
});
