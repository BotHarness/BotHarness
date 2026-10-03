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

it('shows Assignment waiting and blocked counts without changing idle or working motion', () => {
  for (const state of ['idle', 'working'] as const) {
    const markup = renderToStaticMarkup(
      createElement(PersonaBotAvatar, {
        personaBotId: 'ada',
        name: 'Ada',
        size: 32,
        state,
        attention: { approvalCount: 0, waitingHumanCount: 1, blockedCount: 2 },
      }),
    );
    expect(markup).toContain(`data-state="${state}"`);
    expect(markup).toContain('1 个任务等待你回答');
    expect(markup).toContain('2 个任务受阻');
    expect(markup).toMatch(/data-blocked-count="2"[^>]*>3<\/span>/);
  }
});

it('shows Workspace Grant attention in the shared summary without changing execution', () => {
  for (const [count, label] of [
    [1, '1 个工作区待授权'],
    [2, '2 个工作区待授权'],
  ] as const) {
    const html = renderToStaticMarkup(
      createElement(PersonaBotAvatar, {
        personaBotId: 'ada',
        name: 'Ada',
        size: 32,
        state: 'idle',
        attention: { approvalCount: 0, workspaceGrantCount: count },
      }),
    );
    expect(html).toContain('data-state="idle"');
    expect(html).toContain(`data-workspace-grant-count="${count}"`);
    expect(html).toContain(label);
  }
});

it('shows informational updates in a neutral marker and excludes them from red action counts', () => {
  for (const state of ['idle', 'working'] as const) {
    const html = renderToStaticMarkup(
      createElement(PersonaBotAvatar, {
        personaBotId: 'ada',
        name: 'Ada',
        size: 32,
        state,
        attention: { approvalCount: 0, informationalCount: 2 },
      }),
    );
    expect(html).toContain(`data-state="${state}"`);
    expect(html).toContain('class="bh-avatar-information"');
    expect(html).toContain('2 条任务信息更新');
    expect(html).not.toContain('class="bh-avatar-attention"');
    const combined = renderToStaticMarkup(
      createElement(PersonaBotAvatar, {
        personaBotId: 'ada',
        name: 'Ada',
        size: 32,
        state,
        attention: { approvalCount: 1, informationalCount: 2 },
      }),
    );
    expect(combined).toMatch(/data-blocked-count="0"[^>]*>1<\/span>/);
    expect(combined).toContain('2 条任务信息更新');
    expect(combined).not.toContain('class="bh-avatar-information"');
  }
});

it('localizes singular and plural information summaries without replacing idle', () => {
  const t: BotHarnessTranslate = (key, params) => {
    const value: unknown = Reflect.get(en, key);
    if (typeof value !== 'string') throw new Error('Missing translation');
    let label = value;
    for (const [name, replacement] of Object.entries(params ?? {}))
      label = label.replace(`{${name}}`, String(replacement));
    return label;
  };
  for (const [count, label] of [
    [1, '1 Assignment update'],
    [2, '2 Assignment updates'],
  ] as const) {
    const html = renderToStaticMarkup(
      createElement(PersonaBotAvatar, {
        personaBotId: 'ada',
        name: 'Ada',
        size: 32,
        state: 'idle',
        attention: { approvalCount: 0, informationalCount: count },
        t,
      }),
    );
    expect(html).toContain(`aria-label="Ada: Idle · ${label}"`);
  }
});
