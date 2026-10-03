import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { PersonaBotAvatar } from '../src/client/avatar.js';

it('shows approval attention independently of execution motion, including idle', () => {
  for (const state of ['idle', 'working'] as const) {
    const markup = renderToStaticMarkup(
      createElement(PersonaBotAvatar, {
        personaBotId: 'ada',
        name: 'Ada',
        size: 32,
        state,
        attention: { approvalCount: 2 },
      }),
    );
    expect(markup).toContain(`data-state="${state}"`);
    expect(markup).toContain('data-approval-count="2"');
    expect(markup).toContain('2 个工具待审批');
    expect(markup).not.toContain('data-state="waiting"');
  }
});

it('shows combined attention without leaking question content or replacing working state', () => {
  const markup = renderToStaticMarkup(
    createElement(PersonaBotAvatar, {
      personaBotId: 'ada',
      name: 'Ada',
      size: 32,
      state: 'working',
      attention: { approvalCount: 2, questionCount: 1 },
    }),
  );
  expect(markup).toContain('data-state="working"');
  expect(markup).toContain('data-question-count="1"');
  expect(markup).toContain('2 个工具待审批');
  expect(markup).toContain('1 个问题待回答');
  expect(markup).toMatch(/data-question-count="1"[^>]*>3<\/span>/);
  const questionOnly = renderToStaticMarkup(
    createElement(PersonaBotAvatar, {
      personaBotId: 'ada',
      name: 'Ada',
      size: 32,
      state: 'idle',
      attention: { approvalCount: 0, questionCount: 1 },
    }),
  );
  expect(questionOnly).not.toContain('工具待审批');
  expect(questionOnly).toContain('1 个问题待回答');
});
