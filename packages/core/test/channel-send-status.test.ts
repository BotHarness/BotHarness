import { describe, expect, it } from 'vitest';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createSessionOwnership } from '../src/sessions/ownership.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

describe('Human DM send receipt', () => {
  it('returns only committed replies with the exact request and owned Session, including reopen', async () => {
    const home = createTempRoot();
    const owner = trackTestOwner(
      mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
    );
    const database = attachOperationalModule(owner, 'channel');
    const ownership = createSessionOwnership(attachOperationalModule(owner, 'session-ownership'));
    ownership.claim({
      sessionId: 'owned',
      botSlug: 'ada',
      rootRole: 'orchestrator',
      at: '2026-10-10T00:00:00Z',
    });
    const store = createSqliteChannelStore({ rootDir: home, database, databaseOwnerReady: true });
    store.getOrCreateDm('ada', 'Ada');
    const human = (id: string) => ({
      id,
      at: '2026-10-10T00:00:00Z',
      author: { kind: 'human' as const },
      body: id,
    });
    await store.appendMessage('dm-ada', human('first'));
    await store.appendMessage('dm-ada', human('second'));
    const first = store.humanSendStatus?.('dm-ada', 'first');
    const second = store.humanSendStatus?.('dm-ada', 'second');
    if (!first || !second) throw new Error('Missing admitted Human request');
    expect(first?.sourceEventId).toEqual(expect.any(String));
    const bot = (id: string) => ({
      id,
      at: '2026-10-10T00:00:01Z',
      author: { kind: 'bot' as const, slug: 'ada' },
      body: id,
    });
    await store.appendMessage('dm-ada', bot('unattributed'));
    await store.appendMessage('dm-ada', bot('other-request'), {
      sessionId: 'owned',
      sourceEventId: second.sourceEventId,
    });
    await store.appendMessage('dm-ada', bot('unowned'), {
      sessionId: 'unknown',
      sourceEventId: first.sourceEventId,
    });
    await store.appendMessage('dm-ada', bot('matched'), {
      sessionId: 'owned',
      sourceEventId: first.sourceEventId,
    });
    await store.appendMessage(
      'dm-ada',
      {
        ...bot('question-card'),
        userQuestionRequest: {
          sessionId: 'owned',
          questions: [{ id: 'qa', question: 'Pick?', options: [{ label: 'Blue' }] }],
        },
      },
      { sessionId: 'owned', sourceEventId: first.sourceEventId },
    );
    expect(store.humanSendStatus?.('dm-ada', 'first')?.replies.map((reply) => reply.id)).toEqual([
      'matched',
    ]);
    expect(store.humanSendStatus?.('dm-ada', 'second')?.replies.map((reply) => reply.id)).toEqual([
      'other-request',
    ]);
    expect(store.humanSendStatus?.('dm-ada', 'matched')).toBeUndefined();
    expect(store.humanSendStatus?.('missing', 'first')).toBeUndefined();
    owner.close();
    const reopenedOwner = trackTestOwner(
      mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
    );
    const reopened = createSqliteChannelStore({
      rootDir: home,
      database: attachOperationalModule(reopenedOwner, 'channel'),
      databaseOwnerReady: true,
    });
    expect(reopened.humanSendStatus?.('dm-ada', 'first')?.replies.map((reply) => reply.id)).toEqual(
      ['matched'],
    );
  });
});
