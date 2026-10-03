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
