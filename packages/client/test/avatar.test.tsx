import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PersonaBotAvatar, PersonaBotFacepile } from '../src/client/avatar.js';
import { personaBotActivity } from '../src/client/persona-activity.js';
import type { BotSummary, ConversationState, ConversationSelection } from '../src/client/store.js';

const IDLE_BOT: BotSummary = {
  slug: 'ada',
  displayName: 'Ada',
  roles: [],
  aggregateState: 'idle',
  workspaces: [],
  createdAt: '2026-09-21T00:00:00.000Z',
};

const SENDING_CONVERSATION: ConversationState = {
  status: 'ready',
  channel: undefined,
  messages: [],
  drafts: [],
  draftRevision: 0,
  draftNotice: undefined,
  revision: 0,
  timeline: {
    olderCursor: null,
    newerCursor: null,
    hasOlder: false,
    hasNewer: false,
    loadingOlder: false,
    olderError: undefined,
    loadingNewer: false,
    newerError: undefined,
  },
  error: undefined,
  sending: true,
};

const ADA_SELECTION: ConversationSelection = { kind: 'bot', slug: 'ada' };

describe('PersonaBotAvatar', () => {
  it('renders thinking motion and the three-dot state indicator from one state', () => {
    const markup = renderToStaticMarkup(
      createElement(PersonaBotAvatar, {
        personaBotId: 'ada',
        name: 'Ada',
        size: 32,
        state: 'thinking',
      }),
    );

    expect(markup).toContain('data-state="thinking"');
    expect(markup).toContain('data-effect="thinking-dots"');
    expect(markup).toContain('data-media="blob"');
    expect(markup.match(/<i><\/i>/g)).toHaveLength(3);
  });

  it('keeps custom image media still while the shared activity frame stays active', () => {
    const markup = renderToStaticMarkup(
      createElement(PersonaBotAvatar, {
        personaBotId: 'ada',
        name: 'Ada',
        size: 32,
        src: '/avatars/ada.png',
        state: 'working',
      }),
    );

    expect(markup).toContain('data-media="image"');
    expect(markup).toContain('data-active="true"');
    expect(markup).toContain('src="/avatars/ada.png"');
    expect(markup).toContain('data-effect="generic-working"');
  });

  it('caps group facepiles at three avatars and renders an overflow count', () => {
    const items = ['ada', 'bea', 'cy', 'dee'].map((personaBotId) => ({
      personaBotId,
      name: personaBotId,
      state: 'working' as const,
    }));
    const markup = renderToStaticMarkup(
      createElement(PersonaBotFacepile, { items, size: 24, max: 3 }),
    );

    expect(markup.match(/class="bh-persona-avatar/g)).toHaveLength(3);
    expect(markup).toContain('bh-avatar-facepile-overflow');
    expect(markup).toContain('+1');
  });
});

describe('personaBotActivity', () => {
  it('does not infer PersonaBot activity from an in-flight local send', () => {
    expect(
      personaBotActivity(
        { selection: ADA_SELECTION, conversation: SENDING_CONVERSATION },
        IDLE_BOT,
      ),
    ).toBe('idle');
  });

  it('keeps the Host-projected state authoritative', () => {
    expect(
      personaBotActivity(
        { selection: ADA_SELECTION, conversation: SENDING_CONVERSATION },
        { ...IDLE_BOT, aggregateState: 'waiting' },
      ),
    ).toBe('waiting');
  });
});
