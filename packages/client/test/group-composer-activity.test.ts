import {
  createElement,
  type ButtonHTMLAttributes,
  type ReactNode,
  type PropsWithChildren,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { PersonaBotFacepileItem } from '../src/client/avatar.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({
    children,
    icon: _icon,
    ...props
  }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { icon?: unknown }>) =>
    createElement('button', props, children),
  FileTypeIcon: ({ path }: { path: string }) =>
    createElement('span', { 'data-file-type-icon': path }),
  IconCloseOutlineRegular: () => null,
  IconChevronDownOutlineRegular: () => null,
  IconAgentPresetOutlineRegular: () => null,
  IconCodeOutlineRegular: () => null,
  IconBranchOutlineRegular: () => null,
  Tooltip: ({ children }: { children: ReactNode }) => children,
  IconPaperclipOutlineRegular: () => null,
  IconSendOutlineRegular: () => null,
  ImageLightbox: () => null,
}));

import { ChannelComposer } from '../src/client/channel-composer.js';
import { groupComposerActivity } from '../src/client/group-composer-activity.js';
import { zhTranslate } from '../src/client/locale.js';

const working: PersonaBotFacepileItem = {
  personaBotId: 'nova',
  name: 'Nova <QA>',
  state: 'working',
  activity: {
    effect: 'executing',
    toolKind: 'execute',
    toolName: 'bash',
    publicDetail: 'Bounded public operation',
    startedAt: 1000,
    activeToolCount: 1,
  },
  sessions: [
    {
      id: 'activity-11111111-1111-4111-8111-111111111111',
      role: 'assignment',
      name: 'Session-only name',
      revision: 4,
      at: 1000,
      state: 'working',
      activity: {
        effect: 'searching',
        toolKind: 'search',
        publicDetail: 'Session-only detail',
        startedAt: 1000,
        activeToolCount: 1,
      },
    },
  ],
};
const thinking: PersonaBotFacepileItem = {
  personaBotId: 'orbit',
  name: 'Orbit',
  state: 'thinking',
};
const information: PersonaBotFacepileItem = {
  personaBotId: 'info',
  name: 'Info',
  state: 'idle',
  attention: { approvalCount: 0, informationalCount: 1 },
};
const quiet: PersonaBotFacepileItem = { personaBotId: 'quiet', name: 'Quiet', state: 'idle' };

it('orders active members consistently before independent attention and preserves Host facts', () => {
  const members = [quiet, information, thinking, working];
  const first = groupComposerActivity(members, zhTranslate);
  const shuffled = groupComposerActivity([working, thinking, information, quiet], zhTranslate);
  expect(first).toEqual(shuffled);
  expect(first?.items.map((item) => item.personaBotId)).toEqual(['nova', 'orbit', 'info']);
  expect(first?.items[0]).toBe(working);
  expect(first?.items[2]).toBe(information);
  expect(information.state).toBe('idle');
  expect(members).toEqual([quiet, information, thinking, working]);
  expect(first?.summary).toContain('Nova <QA> 正在执行');
  expect(first?.summary).toContain('Orbit 正在思考');
  expect(first?.summary).toContain('另有 1 个');
  expect(first?.summary).not.toContain('Session-only');
});

it('does not present idle members or empty attention metadata as running work', () => {
  expect(
    groupComposerActivity(
      [quiet, { ...quiet, personaBotId: 'zero', attention: { approvalCount: 0 } }],
      zhTranslate,
    ),
  ).toBeUndefined();
  expect(groupComposerActivity([], zhTranslate)).toBeUndefined();
  const result = groupComposerActivity([information], zhTranslate);
  expect(result?.items[0]?.state).toBe('idle');
  expect(result?.summary).toContain('Info');
});

it('renders one named row per Bot from its shared aggregate instead of flattening Sessions', () => {
  const activity = groupComposerActivity([thinking, working], zhTranslate);
  const markup = renderToStaticMarkup(
    createElement(ChannelComposer, {
      value: '',
      placeholder: 'Group',
      sending: false,
      activity,
      onChange: () => undefined,
      onSubmit: () => undefined,
    }),
  );
  expect(
    markup.match(/class="bh-composer-activity-session bh-composer-activity-bot"/gu),
  ).toHaveLength(2);
  expect(markup).toContain('data-bot-id="nova"');
  expect(markup).toContain('Nova &lt;QA&gt;');
  expect(markup).toContain('Bounded public operation');
  expect(markup).not.toContain('Session-only name');
  expect(markup).not.toContain('Session-only detail');
  expect(markup).not.toContain('bh-composer-activity-source-label" title="任务会话');
  expect(markup.match(/class="bh-avatar-facepile-button"/gu)).toHaveLength(2);
  expect(markup).not.toContain('<details open');
});

it('keeps every Bot in the list while the facepile is bounded to three with accurate overflow', () => {
  const members = [
    working,
    thinking,
    { ...thinking, personaBotId: 'a', name: 'A' },
    { ...thinking, personaBotId: 'b', name: 'B' },
  ];
  const activity = groupComposerActivity(members, zhTranslate);
  const markup = renderToStaticMarkup(
    createElement(ChannelComposer, {
      value: '',
      placeholder: 'Group',
      sending: false,
      activity,
      onChange: () => undefined,
      onSubmit: () => undefined,
    }),
  );
  expect(
    markup.match(/class="bh-composer-activity-session bh-composer-activity-bot"/gu),
  ).toHaveLength(4);
  expect(markup.match(/class="bh-avatar-facepile-button"/gu)).toHaveLength(3);
  expect(markup).toContain('>+1</span>');
  expect(activity?.summary).toContain('另有 2 个');
});
