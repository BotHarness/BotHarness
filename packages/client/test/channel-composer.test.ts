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
  IconSendOutline16: () => null,
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

  it('grows to a bounded height and switches to internal scrolling', () => {
    const style = { height: '', overflowY: '' };
    expect(fitComposerTextarea({ scrollHeight: 34, style } as never)).toBe(false);
    expect(style).toEqual({ height: '34px', overflowY: 'hidden' });

    expect(fitComposerTextarea({ scrollHeight: 88, style } as never)).toBe(true);
    expect(style).toEqual({ height: '88px', overflowY: 'hidden' });

    expect(fitComposerTextarea({ scrollHeight: 220, style } as never)).toBe(true);
    expect(style).toEqual({ height: '144px', overflowY: 'auto' });
  });
});
