// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes, type PropsWithChildren } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({
    children,
    icon: _icon,
    ...props
  }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { icon?: unknown }>) =>
    createElement('button', props, children),
  IconSendOutlineRegular: () => null,
}));

import { ChannelComposer } from '../src/client/channel-composer.js';

let container: HTMLDivElement;
let root: Root;
const empty = [] as const;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

function paste(target: Element, files: File[], text = '', itemsOnly = false): Event {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      files: itemsOnly ? [] : files,
      items: files.map((file) => ({ kind: 'file', getAsFile: () => file })),
      getData: (type: string) => (type === 'text/plain' ? text : ''),
    },
  });
  target.dispatchEvent(event);
  return event;
}

describe('Channel composer clipboard attachments', () => {
  it('queues a pasted image from the plain editor without sending it', async () => {
    const onAddFiles = vi.fn();
    const onSubmit = vi.fn();
    await act(async () =>
      root.render(
        createElement(ChannelComposer, {
          value: '',
          placeholder: 'Message',
          sending: false,
          mentionCandidates: empty,
          mentions: empty,
          channelCandidates: empty,
          channelRefs: empty,
          onAddFiles,
          onChange: vi.fn(),
          onSubmit,
        }),
      ),
    );
    const file = new File(['image'], 'screenshot.png', { type: 'image/png' });
    const event = paste(container.querySelector('textarea')!, [file]);
    expect(event.defaultPrevented).toBe(true);
    expect(onAddFiles).toHaveBeenCalledWith([file]);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('queues a pasted document from the rich editor', async () => {
    const onAddFiles = vi.fn();
    await act(async () =>
      root.render(
        createElement(ChannelComposer, {
          value: '',
          placeholder: 'Message',
          sending: false,
          mentionCandidates: empty,
          mentions: empty,
          channelRefs: empty,
          channelCandidates: [{ id: 'g1', name: 'Group' } as never],
          onAddFiles,
          onChange: vi.fn(),
          onSubmit: vi.fn(),
        }),
      ),
    );
    const file = new File(['report'], 'report.pdf', { type: 'application/pdf' });
    const event = paste(container.querySelector('[contenteditable="true"]')!, [file]);
    expect(event.defaultPrevented).toBe(true);
    expect(onAddFiles).toHaveBeenCalledWith([file]);
  });

  it('accepts a clipboard image exposed only through items', async () => {
    const onAddFiles = vi.fn();
    await act(async () =>
      root.render(
        createElement(ChannelComposer, {
          value: '',
          placeholder: 'Message',
          sending: false,
          mentionCandidates: empty,
          mentions: empty,
          channelCandidates: empty,
          channelRefs: empty,
          onAddFiles,
          onChange: vi.fn(),
          onSubmit: vi.fn(),
        }),
      ),
    );
    const file = new File(['image'], 'capture.png', { type: 'image/png' });
    const event = paste(container.querySelector('textarea')!, [file], '', true);
    expect(event.defaultPrevented).toBe(true);
    expect(onAddFiles).toHaveBeenCalledWith([file]);
  });

  it('leaves ordinary text paste to the plain editor', async () => {
    const onAddFiles = vi.fn();
    await act(async () =>
      root.render(
        createElement(ChannelComposer, {
          value: '',
          placeholder: 'Message',
          sending: false,
          mentionCandidates: empty,
          mentions: empty,
          channelCandidates: empty,
          channelRefs: empty,
          onAddFiles,
          onChange: vi.fn(),
          onSubmit: vi.fn(),
        }),
      ),
    );
    const event = paste(container.querySelector('textarea')!, [], 'hello');
    expect(event.defaultPrevented).toBe(false);
    expect(onAddFiles).not.toHaveBeenCalled();
  });
});
