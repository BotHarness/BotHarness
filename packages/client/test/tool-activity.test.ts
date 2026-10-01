import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseActivitySnapshot } from '../src/client/activity-live.js';
import { createStore, type BotSummary } from '../src/client/store.js';
import { PersonaBotAvatar, personaBotActivitySummary } from '../src/client/avatar.js';
import { zhTranslate } from '../src/client/locale.js';
const activity = {
  effect: 'executing' as const,
  toolKind: 'execute' as const,
  toolName: 'shell',
  startedAt: 1000,
  activeToolCount: 1,
};
const bot: BotSummary = {
  slug: 'ada',
  displayName: 'Ada',
  roles: [],
  aggregateState: 'idle',
  workspaces: [],
  createdAt: '2026-10-01',
};
describe('revisioned safe tool presentation', () => {
  it('allowlists the Host DTO and retains current detail over stale roster replies; idle clears it', () => {
    const snapshot = parseActivitySnapshot(
      JSON.stringify({
        generation: 'host',
        revision: 2,
        bots: [{ slug: 'ada', state: 'working', activity: { ...activity, arguments: 'private' } }],
      }),
    );
    expect(snapshot?.bots[0]?.activity).toEqual(activity);
    const store = createStore();
    store.setRoster([bot], []);
    store.applyActivity(snapshot!);
    store.setRoster([bot], []);
    expect(store.getSnapshot().bots[0]?.activity).toEqual(activity);
    store.applyActivity({
      generation: 'host',
      revision: 1,
      bots: [{ slug: 'ada', state: 'idle' }],
    });
    expect(store.getSnapshot().bots[0]?.activity).toEqual(activity);
    store.applyActivity({
      generation: 'host',
      revision: 3,
      bots: [{ slug: 'ada', state: 'idle' }],
    });
    expect(store.getSnapshot().bots[0]?.activity).toBeUndefined();
  });
  it.each([
    { ...activity, effect: 'future' },
    { ...activity, toolKind: 'future' },
    { ...activity, toolName: 'unsafe\nname' },
    { ...activity, activeToolCount: 0 },
    { ...activity, startedAt: -1 },
  ])('rejects invalid tool metadata', (detail) => {
    expect(
      parseActivitySnapshot(
        JSON.stringify({
          generation: 'host',
          revision: 2,
          bots: [{ slug: 'ada', state: 'working', activity: detail }],
        }),
      ),
    ).toBeUndefined();
  });
  it('renders matching safe text and effect; idle does not retain an old tool label', () => {
    const markup = renderToStaticMarkup(
      createElement(PersonaBotAvatar, {
        personaBotId: 'ada',
        name: 'Ada',
        size: 32,
        state: 'working',
        activity,
        t: zhTranslate,
      }),
    );
    expect(markup).toContain('data-effect="executing"');
    expect(markup).toContain('正在执行 · shell');
    expect(personaBotActivitySummary('idle', activity, zhTranslate)).toBe('空闲');
  });
});
