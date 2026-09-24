import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';

import { ChannelMessageBody } from '../src/client/channel-message-body.js';
import { zhTranslate } from '../src/client/locale.js';
import type { ChannelMessage } from '../src/client/store.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  MarkdownText: vi.fn(() => null),
  Modal: () => null,
  StateDot: () => createElement('span', { 'data-state-dot': 'error' }),
  Button: ({ children, ...props }: { children: ReactNode }) =>
    createElement('button', props, children),
}));

function render(
  author: ChannelMessage['author'],
  body: string,
  options: Pick<ChannelMessage, 'format' | 'streaming' | 'attachments' | 'sessionFailure'> = {},
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
  it('uses a compact localized failure row with a settings action and collapsed raw detail', () => {
    const markup = render({ kind: 'bot', slug: 'ada' }, 'Session failed', {
      sessionFailure: {
        role: 'orchestrator',
        sessionId: 'session-auth',
        code: 'AUTH',
        status: 401,
        detail: 'Authentication Fails (request_id: test-123)',
      },
    });
    expect(markup).toContain('API 密钥无效');
    expect(markup).toContain('打开模型设置');
    expect(markup).toContain('data-state-dot="error"');
    expect(markup).toContain('<details');
    expect(markup).toContain('Authentication Fails (request_id: test-123)');
    expect(markup).not.toContain('bh-session-failure-card');
  });

  it('uses the pinned native chat locale for the failure title and AUTH copy', () => {
    const markup = renderToStaticMarkup(
      createElement(ChannelMessageBody, {
        message: {
          id: 'm-native',
          at: '2026-09-19T00:00:00.000Z',
          author: { kind: 'bot', slug: 'ada' },
          body: 'Session failed',
          sessionFailure: {
            role: 'orchestrator',
            sessionId: 'session-auth',
            code: 'AUTH',
            detail: 'raw error',
          },
        },
        t: zhTranslate,
        nativeChatT: (key: string) =>
          key === 'message.turnError' ? 'Native turn failure' : 'Native invalid key',
      }),
    );
    expect(markup).toContain('Native turn failure');
    expect(markup).toContain('Native invalid key');
  });

  it.each([
    ['MISSING_CREDENTIAL', '尚未设置 API 密钥', true],
    ['INVALID_CREDENTIAL', 'API 密钥配置无效', true],
    ['QUOTA', 'API 余额不足', true],
    ['RATE_LIMIT', '请求过于频繁', false],
    ['TRANSPORT', '连接模型服务失败', false],
    ['TIMEOUT', '模型服务响应超时', false],
    ['SERVER', '模型服务暂时不可用', false],
  ])('explains %s without making the raw provider message primary', (code, summary, actionable) => {
    const markup = render({ kind: 'bot', slug: 'ada' }, 'Session failed', {
      sessionFailure: {
        role: 'assignment',
        sessionId: 'session-other',
        code,
        detail: 'Raw provider diagnostic',
        context: 'Read project',
      },
    });
    expect(markup).toContain(summary);
    expect(markup).toContain('Read project');
    expect(markup).toContain('<details');
    expect(markup).toContain('Raw provider diagnostic');
    expect(markup.includes('打开模型设置')).toBe(actionable);
  });

  it('renders server-sniffed images inline and files as downloads', () => {
    const hash = `sha256:${'a'.repeat(64)}`;
    const markup = render({ kind: 'human' }, '', {
      attachments: [
        { hash, name: 'photo.png', mime: 'image/png', size: 123 },
        { hash, name: 'report.pdf', mime: 'application/pdf', size: 456 },
      ],
    });
    expect(markup).toContain('<img');
    expect(markup).toContain('alt="photo.png"');
    expect(markup).toContain('download="report.pdf"');
    expect(markup).toContain('/api/botharness/attachment?hash=');
  });

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
