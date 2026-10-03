import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { en, type BotHarnessTranslate } from '../src/client/locale.js';
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

it('uses singular and plural English question labels in the visible and accessible summaries', () => {
  const translate: BotHarnessTranslate = (key, params) => {
    const value: unknown = Reflect.get(en, key);
    if (typeof value !== 'string') throw new Error('Missing translation');
    let text = value;
    for (const [name, replacement] of Object.entries(params ?? {}))
      text = text.replace(`{${name}}`, String(replacement));
    return text;
  };
  for (const [count, label] of [
    [1, '1 question awaiting an answer'],
    [2, '2 questions awaiting an answer'],
  ] as const) {
    const markup = renderToStaticMarkup(
      createElement(PersonaBotAvatar, {
        personaBotId: 'ada',
        name: 'Ada',
        size: 32,
        state: 'working',
        attention: { approvalCount: 0, questionCount: count },
        t: translate,
      }),
    );
    expect(markup).toContain(`title="Ada · Working · ${label}"`);
    expect(markup).toContain(`aria-label="Ada: Working · ${label}"`);
  }
});
