// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({
    icon: _icon,
    variant: _variant,
    size: _size,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    icon?: unknown;
    variant?: string;
    size?: string;
  }) => createElement('button', props),
  FileTypeIcon: () => null,
  IconCloseOutlineRegular: () => null,
  IconPaperclipOutlineRegular: () => null,
  IconSendOutlineRegular: () => null,
  ImageLightbox: () => null,
}));

import { ChannelComposer } from '../src/client/channel-composer.js';
import type { BotSummary } from '../src/client/store.js';

const ada: BotSummary = {
  slug: 'ada',
  displayName: 'Ada',
  roles: [],
  aggregateState: 'idle',
  workspaces: [],
  createdAt: '',
};

let host: HTMLDivElement;
let root: Root;
let observers: Array<{ observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }>;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  observers = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      disconnect = vi.fn();
      constructor() {
        observers.push(this);
      }
    },
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe('mounted Channel composer', () => {
  it('focuses only on a reply or focus request and disconnects the prior input observer', async () => {
    const onSubmit = vi.fn();
    const onChange = vi.fn();
    const render = async (props: {
      value?: string;
      reply?: { id: string; author: string; body: string };
      focusSignal?: number;
      rich?: boolean;
    }) => {
      await act(async () =>
        root.render(
          createElement(ChannelComposer, {
            value: props.value ?? '',
            placeholder: 'Message Ada',
            sending: false,
            ...(props.reply === undefined ? {} : { reply: props.reply }),
            ...(props.focusSignal === undefined ? {} : { focusSignal: props.focusSignal }),
            mentionCandidates: props.rich ? [ada] : [],
            onChange,
            onSubmit,
          }),
        ),
      );
    };
    await render({});
    expect(observers).toHaveLength(1);
    expect(observers[0]?.observe).toHaveBeenCalledWith(host.querySelector('textarea'));

    const outside = document.createElement('button');
    document.body.append(outside);
    try {
      outside.focus();
      await render({ reply: { id: 'message-1', author: 'Ada', body: 'Original' } });
      expect(document.activeElement).toBe(host.querySelector('textarea'));
      expect(observers[0]?.disconnect).toHaveBeenCalledOnce();

      outside.focus();
      await render({ value: 'draft', reply: { id: 'message-1', author: 'Ada', body: 'Original' } });
      expect(document.activeElement).toBe(outside);
      expect(observers).toHaveLength(2);

      await render({ value: 'draft', focusSignal: 1 });
      expect(document.activeElement).toBe(host.querySelector('textarea'));
      await act(async () =>
        host
          .querySelector('textarea')
          ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
      );
      expect(onSubmit).toHaveBeenCalledOnce();
      await act(async () =>
        host
          .querySelector('textarea')
          ?.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }),
          ),
      );
      expect(onSubmit).toHaveBeenCalledOnce();

      await render({ value: 'draft', focusSignal: 1, rich: true });
      expect(host.querySelector('[role="textbox"]')).not.toBeNull();
      expect(observers.at(-1)?.observe).toHaveBeenCalledWith(
        host.querySelector('[role="textbox"]'),
      );
    } finally {
      outside.remove();
    }
    await act(async () => root.render(null));
    expect(observers.every((observer) => observer.disconnect.mock.calls.length === 1)).toBe(true);
  });
});
