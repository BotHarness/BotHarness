import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';

import { ChannelMessageBody } from '../src/client/channel-message-body.js';
import { zhTranslate } from '../src/client/locale.js';
import type { ChannelMessage } from '../src/client/store.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  MarkdownText: vi.fn(() => null),
}));

function render(
  author: ChannelMessage['author'],
  body: string,
  options: Pick<ChannelMessage, 'format' | 'streaming'> = {},
) {
  return renderToStaticMarkup(
    createElement(ChannelMessageBody, {
      message: { id: 'm1', at: '2026-09-19T00:00:00.000Z', author, body, ...options },
      t: zhTranslate,
    }),
  );
}

beforeEach(() => vi.mocked(MarkdownText).mockClear());

describe('Channel message body', () => {
  it('routes Bot and bridged messages to the public DSH Markdown renderer', () => {
    for (const author of [
      { kind: 'bot', slug: 'ada' },
      { kind: 'bridged', source: 'lark' },
    ] as const) {
      expect(render(author, '## Report')).toContain('bh-bubble-body-markdown');
      expect(vi.mocked(MarkdownText).mock.calls[0]?.[0]).toMatchObject({
        text: '## Report',
        streaming: false,
      });
      vi.mocked(MarkdownText).mockClear();
    }
  });

  it('keeps Human punctuation, whitespace and newlines literal', () => {
    const markup = render({ kind: 'human' }, '# not a heading\n**not bold**  ');
    expect(markup).toContain('# not a heading\n**not bold**  ');
    expect(markup).not.toContain('bh-bubble-body-markdown');
    expect(MarkdownText).not.toHaveBeenCalled();
  });

  it('honors an explicit text override for Bot messages', () => {
    expect(render({ kind: 'bot', slug: 'ada' }, '**literal**', { format: 'text' })).toContain(
      '**literal**',
    );
    expect(MarkdownText).not.toHaveBeenCalled();
  });

  it('passes streaming state and localized labels without enabling file extensions', () => {
    render({ kind: 'bot', slug: 'ada' }, 'partial', { streaming: true });
    expect(vi.mocked(MarkdownText).mock.calls[0]?.[0]).toMatchObject({
      text: 'partial',
      streaming: true,
      labels: { code: { copyLabel: '复制代码', copiedLabel: '已复制' }, footnotes: '脚注' },
    });
    expect(vi.mocked(MarkdownText).mock.calls[0]?.[0].fileMentions).toBeUndefined();
    expect(vi.mocked(MarkdownText).mock.calls[0]?.[0].pathImages).toBeUndefined();
  });
});
