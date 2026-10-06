// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  const Tag = ({ children }: PropsWithChildren) => createElement('span', null, children);
  return {
    Button: ({ children, onClick }: PropsWithChildren<{ onClick?(): void }>) =>
      createElement('button', { type: 'button', onClick }, children),
    Input: stub,
    Tag,
    Tooltip: ({ children }: PropsWithChildren) => children,
    Switch: ({ checked, label }: { checked: boolean; label: string }) =>
      createElement('input', { type: 'checkbox', checked, readOnly: true, 'aria-label': label }),
    SegmentedControl: stub,
    Modal: ({ children }: PropsWithChildren) => createElement('div', { role: 'dialog' }, children),
    IconPlusOutlineRegular: stub,
    IconCloseOutlineRegular: stub,
  };
});

import type { BridgeActions } from '../src/client/actions.js';
import type { BotScheduleView } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import {
  BotSchedulesEntry,
  ScheduleDialog,
  emptyScheduleForm,
  formatScheduleTime,
  scheduleCadenceLabel,
  scheduleFormOf,
  scheduleTriggerOf,
} from '../src/client/schedules-entry.js';

const schedule: BotScheduleView = {
  id: 'sch-1',
  botSlug: 'ada',
  title: '每日早报',
  prompt: 'Summarise overnight changes',
  trigger: { kind: 'every', everySeconds: 7200 },
  enabled: true,
  creator: 'human',
  locked: false,
  nextRunAt: '2026-10-06T09:00:00.000Z',
  lastFiring: {
    id: 'f-1',
    scheduleId: 'sch-1',
    trigger: 'planned',
    occurrenceAt: '2026-10-06T07:00:00.000Z',
    firedAt: '2026-10-06T07:00:00.000Z',
    state: 'handled',
    sessionId: 'session-1',
  },
  createdAt: '2026-10-06T00:00:00.000Z',
  updatedAt: '2026-10-06T00:00:00.000Z',
};

describe('Bot Schedule form helpers', () => {
  it('turns minute, hour and daily forms into triggers', () => {
    const form = emptyScheduleForm('Asia/Shanghai');
    expect(scheduleTriggerOf(form)).toEqual({ kind: 'every', everySeconds: 3600 });
    expect(scheduleTriggerOf({ ...form, unit: 'minutes', every: '5' })).toEqual({
      kind: 'every',
      everySeconds: 300,
    });
    expect(scheduleTriggerOf({ ...form, unit: 'daily', time: '08:30' })).toEqual({
      kind: 'daily',
      time: '08:30',
      timeZone: 'Asia/Shanghai',
    });
    expect(scheduleTriggerOf({ ...form, every: '0' })).toBeUndefined();
    expect(scheduleTriggerOf({ ...form, every: '1.5' })).toBeUndefined();
    expect(scheduleTriggerOf({ ...form, unit: 'daily', time: '8' })).toBeUndefined();
  });

  it('round-trips a stored schedule into the editor form', () => {
    expect(scheduleFormOf(schedule)).toMatchObject({ unit: 'hours', every: '2' });
    expect(
      scheduleFormOf({ ...schedule, trigger: { kind: 'every', everySeconds: 900 } }),
    ).toMatchObject({ unit: 'minutes', every: '15' });
    expect(
      scheduleFormOf({
        ...schedule,
        trigger: { kind: 'daily', time: '09:15', timeZone: 'Asia/Tokyo' },
      }),
    ).toMatchObject({ unit: 'daily', time: '09:15', timeZone: 'Asia/Tokyo' });
  });

  it('labels cadences', () => {
    expect(scheduleCadenceLabel({ kind: 'every', everySeconds: 60 }, zhTranslate)).toBe('每分钟');
    expect(scheduleCadenceLabel({ kind: 'every', everySeconds: 600 }, zhTranslate)).toBe(
      '每 10 分钟',
    );
    expect(scheduleCadenceLabel({ kind: 'every', everySeconds: 3600 }, zhTranslate)).toBe('每小时');
    expect(scheduleCadenceLabel({ kind: 'every', everySeconds: 10800 }, zhTranslate)).toBe(
      '每 3 小时',
    );
    expect(
      scheduleCadenceLabel({ kind: 'daily', time: '09:00', timeZone: 'UTC' }, zhTranslate),
    ).toBe('每天 09:00');
  });

  it('shows the date only when the next run is not today', () => {
    const now = new Date(2026, 9, 6, 8, 0);
    expect(formatScheduleTime(new Date(2026, 9, 6, 9, 5).toISOString(), now)).toBe('09:05');
    expect(formatScheduleTime(new Date(2026, 9, 7, 9, 5).toISOString(), now)).toBe('10-07 09:05');
  });
});

describe('Bot Schedules sidebar entry', () => {
  it('lists schedules with cadence, last firing and creator chips', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const actions = {
      botSchedules: vi.fn(async () => [schedule]),
      botScheduleHistory: vi.fn(async () => []),
    } as unknown as BridgeActions;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        createElement(BotSchedulesEntry, {
          scope: 'personabot',
          channelId: 'dm-ada',
          botSlug: 'ada',
          actions,
          t: zhTranslate,
        } as never),
      );
    });
    expect(actions.botSchedules).toHaveBeenCalledWith('ada');
    const text = host.textContent ?? '';
    expect(text).toContain('每日早报');
    expect(text).toContain('每 2 小时');
    expect(text).toContain('已处理');
    expect(host.querySelector('[aria-label="由你创建"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="启用「每日早报」"]')).not.toBeNull();
    await act(async () => root.unmount());
    host.remove();
  });
});

describe('Bot Schedule dialog opened from the Bot Inbox', () => {
  async function render(
    rows: BotScheduleView[],
  ): Promise<{ host: HTMLElement; done(): Promise<void> }> {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const actions = {
      botSchedules: vi.fn(async () => rows),
      botScheduleHistory: vi.fn(async () => (rows.length === 0 ? [] : [schedule.lastFiring])),
    } as unknown as BridgeActions;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        createElement(ScheduleDialog, {
          botSlug: 'ada',
          scheduleId: 'sch-1',
          actions,
          t: zhTranslate,
          onClose: () => undefined,
        }),
      );
    });
    return {
      host,
      done: async () => {
        await act(async () => root.unmount());
        host.remove();
      },
    };
  }

  it('loads the schedule with its firing history', async () => {
    const { host, done } = await render([schedule]);
    expect(host.textContent).toContain('最近触发');
    expect(host.textContent).toContain('已处理');
    await done();
  });

  it('says when the schedule was deleted', async () => {
    const { host, done } = await render([]);
    expect(host.textContent).toContain('这个定时任务已被删除。');
    await done();
  });
});
