import { expect, it } from 'vitest';
import { WindowCompanion } from '../src/client/window-companion.js';

it('derives one bounded mouth from real text reveal and keeps typing during reading and restores the saved face on end and cancel', async () => {
  const events = new EventTarget();
  const owner = new WindowCompanion({
    context: async () => ({ profileId: 'speech-qa' }),
    source: () => ({ addEventListener: events.addEventListener.bind(events), close() {} }),
  });
  const send = (name: string, data: unknown) =>
    events.dispatchEvent(new MessageEvent(name, { data: JSON.stringify(data) }));
  try {
    await owner.start();
    owner.select('ada');
    send('companion/baseline', {
      profileId: 'speech-qa',
      bot: { slug: 'ada', name: 'Ada', paused: false },
      activity: { generation: 'host', revision: 0, bots: [] },
    });
    const message = (messageId: string, body: string) =>
      send('companion/message', {
        generation: 'host',
        botId: 'ada',
        messageId,
        body,
        channelId: 'dm',
        channelName: 'Ada',
        source: 'own-dm',
      });
    message('first', 'abcde!ghijklmnopqrstuvwxyz');
    expect(owner.getSnapshot().mouth).toBe('saved');
    owner.advance(105);
    expect(owner.getSnapshot().mouth).toBe('half-open');
    owner.advance(105);
    expect(owner.getSnapshot().mouth).toBe('closed');
    owner.advance(420);
    expect(owner.getSnapshot().mouth).toBe('open');
    owner.reading(true);
    expect(owner.getSnapshot().mouth).toBe('open');
    owner.advance(105);
    expect(owner.getSnapshot().mouth).toBe('half-open');
    owner.reading(false);
    expect(owner.getSnapshot().mouth).toBe('half-open');
    message('second', '12345678901234567890');
    expect(owner.getSnapshot().mouth).toBe('half-open');
    owner.dismiss('first', 'dm');
    expect(owner.getSnapshot().mouth).toBe('saved');
    owner.advance(210);
    expect(owner.getSnapshot().mouth).toBe('open');
    owner.advance(30000, true);
    expect(owner.getSnapshot().mouth).toBe('saved');
    owner.dismiss('second', 'dm');
    expect(owner.getSnapshot().mouth).toBe('saved');
    message('emoji', '👩🏽‍💻é你好abcdefghijklmnop');
    owner.advance(35);
    const card = owner.getSnapshot().cards[0]!;
    expect(card.body.slice(0, card.shown)).toBe('👩🏽‍💻');
    owner.advance(70);
    expect(owner.getSnapshot().mouth).toBe('half-open');
    owner.dispose();
    expect(owner.getSnapshot().mouth).toBe('saved');
    expect(owner.getSnapshot().cards).toEqual([]);
  } finally {
    owner.dispose();
  }
});
