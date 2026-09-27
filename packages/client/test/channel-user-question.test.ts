// @vitest-environment jsdom
import {
  act,
  createElement,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({
    children,
    variant: _variant,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; children: ReactNode }) =>
    createElement('button', props, children),
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => createElement('input', props),
  MarkdownText: () => null,
  StateDot: () => null,
  Modal: () => null,
  Switch: () => null,
  IconChevronDownOutlineRegular: () => null,
  IconCloseOutlineRegular: () => null,
  IconFolderOpenOutlineRegular: () => null,
}));

import type { BridgeActions } from '../src/client/actions.js';
import { ChannelMessageBody } from '../src/client/channel-message-body.js';
import { zhTranslate } from '../src/client/locale.js';
import { store, type ChannelMessage } from '../src/client/store.js';

const channel = {
  id: 'dm-ada',
  type: 'dm' as const,
  name: 'Ada',
  members: ['ada'],
  botSlug: 'ada',
  createdAt: '2026-09-25T00:00:00.000Z',
  updatedAt: '2026-09-25T00:00:00.000Z',
};
const message: ChannelMessage = {
  id: 'question-1',
  at: '2026-09-25T00:00:00.000Z',
  author: { kind: 'bot', slug: 'ada' },
  body: 'Which branch?',
  userQuestionRequest: {
    sessionId: 'orchestrator-1',
    questions: [
      {
        id: 'memory-branch',
        question: 'Which Memory branch should I switch to?',
        options: [{ label: 'main' }, { label: 'history-qa' }],
      },
    ],
  },
};

let container: HTMLDivElement;
let root: Root;
let previous: ReturnType<typeof store.getSnapshot>['conversation'];

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  previous = store.getSnapshot().conversation;
  store.setConversation({ status: 'ready', channel, messages: [message], revision: 1 });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  store.setConversation(previous);
});

function render(actions: BridgeActions, resolution?: 'answered' | 'cancelled') {
  root.render(
    createElement(ChannelMessageBody, {
      message,
      actions,
      t: zhTranslate,
      userQuestionResolution: resolution,
    }),
  );
}

function button(text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((entry) =>
    entry.textContent?.includes(text),
  );
}

describe('native question card interaction', () => {
  it('submits the chosen branch and shows a durable answered state', async () => {
    const actions = {
      userQuestionStatus: vi.fn().mockResolvedValue('pending'),
      answerUserQuestion: vi.fn().mockResolvedValue(undefined),
    } as unknown as BridgeActions;
    await act(async () => render(actions));
    expect(actions.userQuestionStatus).toHaveBeenCalledWith('dm-ada', 'question-1');
    await act(async () => button('history-qa')?.click());
    expect(button('history-qa')?.getAttribute('aria-pressed')).toBe('true');
    await act(async () => button('回答并继续')?.click());
    expect(actions.answerUserQuestion).toHaveBeenCalledWith('dm-ada', 'question-1', [
      { id: 'memory-branch', selected: ['history-qa'] },
    ]);
    expect(container.textContent).toContain('已回答');
    await act(async () => render(actions, 'answered'));
    expect(button('回答并继续')).toBeUndefined();
    expect(button('history-qa')?.disabled).toBe(true);
  });

  it('retries a failed status read without expiring a pending question', async () => {
    const actions = {
      userQuestionStatus: vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValue('pending'),
      answerUserQuestion: vi.fn(),
    } as unknown as BridgeActions;
    await act(async () => render(actions));
    expect(container.textContent).toContain('暂时无法确认提问状态');
    expect(button('回答并继续')).toBeUndefined();
    await act(async () => button('重试检查')?.click());
    expect(actions.userQuestionStatus).toHaveBeenCalledTimes(2);
    expect(button('回答并继续')).toBeDefined();
    expect(button('main')?.disabled).toBe(false);
  });

  it('accepts a custom branch answer and disables an expired question', async () => {
    const actions = {
      userQuestionStatus: vi.fn().mockResolvedValue('pending'),
      answerUserQuestion: vi.fn().mockResolvedValue(undefined),
    } as unknown as BridgeActions;
    await act(async () => render(actions));
    await act(async () => button('main')?.click());
    expect(button('main')?.getAttribute('aria-pressed')).toBe('true');
    const input = container.querySelector<HTMLInputElement>('input');
    expect(input).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'new-branch');
      input?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(button('main')?.getAttribute('aria-pressed')).toBe('false');
    await act(async () => button('回答并继续')?.click());
    expect(actions.answerUserQuestion).toHaveBeenCalledWith('dm-ada', 'question-1', [
      { id: 'memory-branch', selected: [], custom: 'new-branch' },
    ]);

    const expiredActions = {
      userQuestionStatus: vi.fn().mockResolvedValue('expired'),
      answerUserQuestion: vi.fn(),
    } as unknown as BridgeActions;
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => render(expiredActions));
    expect(container.textContent).toContain('此提问已失效');
    expect(button('回答并继续')).toBeUndefined();
    expect(button('main')?.disabled).toBe(true);
  });
});
