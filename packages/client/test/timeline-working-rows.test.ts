import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PersonaBotFacepileItem } from '../src/client/avatar.js';
import { groupComposerActivity } from '../src/client/group-composer-activity.js';
import { zhTranslate } from '../src/client/locale.js';
import {
  TimelineWorkingRowsView,
  timelineWorkingRows,
} from '../src/client/timeline-working-rows.js';

const mira: PersonaBotFacepileItem = {
  personaBotId: 'mira',
  name: 'Mira',
  state: 'working',
  activity: {
    effect: 'searching',
    toolKind: 'search',
    toolName: 'web_search',
    startedAt: 1,
    activeToolCount: 1,
  },
};
const nova: PersonaBotFacepileItem = { personaBotId: 'nova', name: 'Nova', state: 'thinking' };
const kai: PersonaBotFacepileItem = { personaBotId: 'kai', name: 'Kai', state: 'working' };
const waiting: PersonaBotFacepileItem = {
  personaBotId: 'ada',
  name: 'Ada',
  state: 'waiting',
  attention: { approvalCount: 1 },
};
const blocked: PersonaBotFacepileItem = { personaBotId: 'bea', name: 'Bea', state: 'blocked' };
const none = new Set<string>();

describe('timelineWorkingRows', () => {
  it('shows a working DM Bot as one row', () => {
    const rows = timelineWorkingRows({ items: [mira], summary: '' }, none);
    expect(rows.items.map((item) => item.personaBotId)).toEqual(['mira']);
    expect(rows.more).toBe(0);
  });

  it('keeps the Group composer order and caps rows like the composer summary', () => {
    const activity = groupComposerActivity([waiting, nova, kai, mira, blocked], zhTranslate);
    const rows = timelineWorkingRows(activity, none);
    expect(rows.items.map((item) => item.personaBotId)).toEqual(['kai', 'mira']);
    expect(rows.more).toBe(1);
  });

  it('leaves waiting and blocked Bots to their cards', () => {
    expect(timelineWorkingRows({ items: [waiting, blocked], summary: '' }, none).items).toEqual([]);
  });

  it('leaves a working Bot that waits on an approval or question to its card', () => {
    const approval = { ...kai, attention: { approvalCount: 1 } };
    const question = { ...nova, attention: { approvalCount: 0, questionCount: 1 } };
    const informed = { ...mira, attention: { approvalCount: 0, informationalCount: 1 } };
    const rows = timelineWorkingRows({ items: [approval, question, informed], summary: '' }, none);
    expect(rows.items.map((item) => item.personaBotId)).toEqual(['mira']);
  });

  it('keeps the row text to the action, tool and public detail', () => {
    const html = renderToStaticMarkup(
      createElement(TimelineWorkingRowsView, {
        rows: {
          items: [
            {
              ...mira,
              activity: {
                ...mira.activity!,
                publicDetail: 'deepseek.com',
                activeToolCount: 3,
                sources: [{ role: 'orchestrator', count: 1 }],
              },
            },
          ],
          more: 0,
        },
        t: zhTranslate,
      }),
    );
    expect(html).toContain('Mira</span> · 正在搜索 · web_search · deepseek.com<span');
  });

  it('hands a Bot over to its streaming draft', () => {
    const rows = timelineWorkingRows({ items: [mira, nova], summary: '' }, new Set(['mira']));
    expect(rows.items.map((item) => item.personaBotId)).toEqual(['nova']);
  });
});

describe('TimelineWorkingRowsView', () => {
  it('renders the morphing avatar at message size with the safe summary, hidden from assistive tech', () => {
    const html = renderToStaticMarkup(
      createElement(TimelineWorkingRowsView, {
        rows: { items: [mira], more: 0 },
        t: zhTranslate,
      }),
    );
    expect(html).toContain('<div class="bh-timeline-working" aria-hidden="true">');
    expect(html).toContain('data-state="working"');
    expect(html).toContain('data-effect="searching"');
    expect(html).toContain('width:28px;height:28px');
    expect(html).toContain('Mira</span> · 正在搜索 · web_search');
    expect(html).toContain('bh-timeline-working-ellipsis');
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain('aria-live');
  });

  it('renders nothing without active Bots and a more line past the cap', () => {
    expect(
      renderToStaticMarkup(
        createElement(TimelineWorkingRowsView, { rows: { items: [], more: 0 }, t: zhTranslate }),
      ),
    ).toBe('');
    expect(
      renderToStaticMarkup(
        createElement(TimelineWorkingRowsView, {
          rows: { items: [mira, nova], more: 2 },
          t: zhTranslate,
        }),
      ),
    ).toContain('另有 2 个');
  });
});
