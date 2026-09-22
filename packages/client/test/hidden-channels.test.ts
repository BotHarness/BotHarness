import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({
  buttons: [] as Array<Record<string, unknown>>,
  inputs: [] as Array<Record<string, unknown>>,
}));

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: Record<string, unknown>) => {
    captured.buttons.push(props);
    return createElement('button', null, props['children'] as ReactNode);
  },
  Input: (props: Record<string, unknown>) => {
    captured.inputs.push(props);
    return createElement('input', {
      placeholder: props['placeholder'],
      value: props['value'],
      readOnly: true,
    });
  },
  Modal: (props: Record<string, unknown>) =>
    createElement(
      'section',
      null,
      createElement('h1', null, props['title'] as ReactNode),
      createElement('p', null, props['description'] as ReactNode),
      props['children'] as ReactNode,
      props['footer'] as ReactNode,
    ),
}));

vi.mock('../src/client/avatar.js', () => ({
  PersonaBotAvatar: (props: { name: string }) =>
    createElement('span', { 'data-avatar': props.name }, props.name),
}));

import {
  HIDDEN_CHANNEL_SEARCH_DEBOUNCE_MS,
  HiddenChannelsModal,
} from '../src/client/hidden-channels.js';
import { zh, zhTranslate, type BotHarnessKey } from '../src/client/locale.js';

const t = zhTranslate;
const AT = '2026-09-21T00:00:00.000Z';

beforeEach(() => {
  captured.buttons.length = 0;
  captured.inputs.length = 0;
});

it('debounces filtering without delaying the controlled input', () => {
  expect(HIDDEN_CHANNEL_SEARCH_DEBOUNCE_MS).toBe(180);
});

describe('hidden Channels modal', () => {
  it('lists hidden DM and group Channels and restores the selected id', () => {
    const onRestore = vi.fn();
    const markup = renderToStaticMarkup(
      createElement(HiddenChannelsModal, {
        t: t as never,
        onRestore,
        onClose: vi.fn(),
        items: [
          {
            channel: {
              id: 'dm-ada',
              type: 'dm',
              name: 'Ada',
              members: ['ada'],
              botSlug: 'ada',
              createdAt: AT,
              updatedAt: AT,
            },
            bot: {
              slug: 'ada',
              displayName: 'Ada',
              roles: ['研究'],
              aggregateState: 'idle',
              workspaces: [],
              createdAt: AT,
            },
            activity: 'idle',
          },
          {
            channel: {
              id: 'group-team',
              type: 'group',
              name: 'Team',
              members: [],
              createdAt: AT,
              updatedAt: AT,
            },
          },
        ],
      }),
    );

    expect(markup).toContain('Ada');
    expect(markup).toContain('私聊 · 研究');
    expect(markup).toContain('Team');
    expect(markup).toContain('群聊');
    expect(captured.inputs.at(-1)?.['placeholder']).toBe('搜索隐藏的频道');
    const restore = captured.buttons.find((button) => button['children'] === '恢复');
    (restore?.['onClick'] as (() => void) | undefined)?.();
    expect(onRestore).toHaveBeenCalledWith('group-team');
  });

  it('shows the most recently hidden Channel first', () => {
    const markup = renderToStaticMarkup(
      createElement(HiddenChannelsModal, {
        t: t as never,
        onRestore: vi.fn(),
        onClose: vi.fn(),
        items: [
          {
            channel: {
              id: 'group-older',
              type: 'group',
              name: 'Earlier hidden',
              members: [],
              createdAt: AT,
              updatedAt: AT,
            },
          },
          {
            channel: {
              id: 'group-newer',
              type: 'group',
              name: 'Recently hidden',
              members: [],
              createdAt: AT,
              updatedAt: AT,
            },
          },
        ],
      }),
    );

    expect(markup.indexOf('Recently hidden')).toBeLessThan(markup.indexOf('Earlier hidden'));
  });

  it('explains that there are no hidden Channels', () => {
    const markup = renderToStaticMarkup(
      createElement(HiddenChannelsModal, {
        items: [],
        t: t as never,
        onRestore: vi.fn(),
        onClose: vi.fn(),
      }),
    );

    expect(markup).toContain('没有隐藏的频道');
    expect(markup).toContain('不会删除频道、消息或 PersonaBot');
  });
});
