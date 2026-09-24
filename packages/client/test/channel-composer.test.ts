import { createElement, type ButtonHTMLAttributes, type PropsWithChildren } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({
    children,
    icon: _icon,
    ...props
  }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { icon?: unknown }>) =>
    createElement('button', props, children),
  IconSendOutlineRegular: () => null,
}));

import {
  ChannelComposer,
  fitComposerTextarea,
  shouldSubmitComposerKey,
} from '../src/client/channel-composer.js';

describe('Channel composer', () => {
  it('renders a non-interactive live activity status outside the rounded composer', () => {
    const markup = renderToStaticMarkup(
      createElement(ChannelComposer, {
        value: 'hello',
        placeholder: '发消息给 Ada',
        sending: false,
        activity: {
          items: [{ personaBotId: 'ada', name: 'Ada', state: 'thinking' }],
          summary: 'Ada 正在思考',
        },
        onChange: () => undefined,
        onSubmit: () => undefined,
      }),
    );

    expect(markup).toContain('class="bh-composer-shell"');
    expect(markup).toContain('class="bh-composer-activity-status"');
    expect(markup.indexOf('bh-composer-activity-status')).toBeLessThan(
      markup.indexOf('class="bh-composer bh-composer-'),
    );
    expect(markup).toContain('class="bh-avatar-facepile bh-composer-activity-facepile"');
    expect(markup).toContain('style="width:40px;height:40px"');
    expect(markup).not.toContain('aria-expanded');
    expect(markup).toContain('Ada 正在思考');
    expect(markup).toContain('<textarea');
    expect(markup).toContain('hello');
    expect(markup).toContain('class="bh-composer bh-composer-compact"');
    expect(markup).not.toContain('bh-composer-with-footer');
    expect(markup).toContain('data-layout="compact"');
  });

  it('does not render status chrome when no active projection is available', () => {
    const markup = renderToStaticMarkup(
      createElement(ChannelComposer, {
        value: '',
        placeholder: '发消息',
        sending: true,
        onChange: () => undefined,
        onSubmit: () => undefined,
      }),
    );

    expect(markup).not.toContain('bh-composer-activity-status');
    expect(markup).toContain('class="bh-composer bh-composer-compact"');
    expect(markup).toContain('disabled=""');
  });

  it('keeps a cancellable reply quote inside the composer island', () => {
    const markup = renderToStaticMarkup(
      createElement(ChannelComposer, {
        value: 'answer',
        placeholder: 'Message Ada',
        sending: false,
        reply: { id: 'm1', author: 'Ada', body: 'original text' },
        onChange: () => undefined,
        onCancelReply: () => undefined,
        onSubmit: () => undefined,
      }),
    );
    expect(markup).toContain('bh-composer-replying');
    expect(markup).toContain('bh-composer-with-footer');
    expect(markup).toContain('bh-composer-reply-copy');
    expect(markup).toContain('original text');
    expect(markup).toContain('bh-composer-reply-cancel');
    expect(markup).toContain('answer');
  });

  it('keeps failed uploads visible and blocks sending until retry succeeds', () => {
    const file = new File(['report'], 'report.pdf', { type: 'application/pdf' });
    const render = (status: 'error' | 'ready') =>
      renderToStaticMarkup(
        createElement(ChannelComposer, {
          value: '',
          placeholder: 'Message Ada',
          sending: false,
          attachments: [
            {
              id: 'upload-1',
              file,
              status,
              ...(status === 'error'
                ? { error: 'network unavailable' }
                : {
                    ref: {
                      hash: `sha256:${'a'.repeat(64)}`,
                      name: 'report.pdf',
                      mime: 'application/pdf',
                      size: 6,
                    },
                  }),
            },
          ],
          onChange: () => undefined,
          onSubmit: () => undefined,
        }),
      );

    const failed = render('error');
    expect(failed).toContain('bh-composer-with-footer');
    expect(failed).toContain('report.pdf');
    expect(failed).toContain('title="network unavailable"');
    expect(failed).toContain('重试');
    expect(failed.match(/<button class="bh-send-btn"[^>]*>/u)?.[0]).toContain('disabled=""');

    const ready = render('ready');
    expect(ready.match(/<button class="bh-send-btn"[^>]*>/u)?.[0]).not.toContain('disabled');
  });

  it('submits plain Enter but preserves multiline and IME input', () => {
    const key = (patch: {
      key?: string;
      shiftKey?: boolean;
      isComposing?: boolean;
      keyCode?: number;
    }) =>
      shouldSubmitComposerKey({
        key: patch.key ?? 'Enter',
        shiftKey: patch.shiftKey ?? false,
        nativeEvent: {
          isComposing: patch.isComposing ?? false,
          keyCode: patch.keyCode ?? 13,
        },
      } as never);

    expect(key({})).toBe(true);
    expect(key({ shiftKey: true })).toBe(false);
    expect(key({ isComposing: true })).toBe(false);
    expect(key({ keyCode: 229 })).toBe(false);
    expect(key({ key: 'a' })).toBe(false);
  });

  it('grows, shrinks back to one line, and switches to bounded scrolling', () => {
    const style = { height: '', overflowY: '' };
    const element = { scrollHeight: 88, style };

    expect(fitComposerTextarea(element as never)).toEqual({ expanded: true, height: 88 });
    expect(style).toEqual({ height: '88px', overflowY: 'hidden' });

    element.scrollHeight = 34;
    expect(fitComposerTextarea(element as never)).toEqual({ expanded: false, height: 34 });
    expect(style).toEqual({ height: '34px', overflowY: 'hidden' });

    element.scrollHeight = 220;
    expect(fitComposerTextarea(element as never)).toEqual({ expanded: true, height: 144 });
    expect(style).toEqual({ height: '144px', overflowY: 'auto' });
  });
});
