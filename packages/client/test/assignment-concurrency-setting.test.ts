// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { AssignmentConcurrencySetting } from '../src/client/assignment-concurrency-setting.js';
import { zhTranslate } from '../src/client/locale.js';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ Button: 'button', Input: 'input' }));

async function mount(save: (limit: number) => Promise<boolean>, writable = true) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      createElement(AssignmentConcurrencySetting, { t: zhTranslate, limit: 3, writable, save }),
    ),
  );
  const input = host.querySelector('input')!;
  const form = host.querySelector('form')!;
  return {
    host,
    input,
    change: async (value: string) => {
      await act(async () => {
        input.value = value;
        Simulate.change(input);
      });
    },
    submit: async () => {
      await act(async () => {
        Simulate.submit(form);
      });
    },
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
describe('Assignment concurrency setting', () => {
  it('validates before saving and keeps the draft actionable after a failed save', async () => {
    const save = vi.fn(async () => false);
    const ui = await mount(save);
    try {
      await ui.change('1.5');
      await ui.submit();
      expect(save).not.toHaveBeenCalled();
      expect(ui.host.querySelector('[role="alert"]')?.textContent).toContain('整数');
      await ui.change('2');
      await ui.submit();
      expect(save).toHaveBeenCalledWith(2);
      expect(ui.input.value).toBe('2');
      expect(ui.host.querySelector('[role="alert"]')?.textContent).toContain('原上限仍然有效');
      expect(ui.host.querySelector('[role="status"]')).toBeNull();
    } finally {
      await ui.close();
    }
  });
  it('prevents duplicate submissions and only acknowledges successful completion', async () => {
    let settle: ((accepted: boolean) => void) | undefined;
    const save = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          settle = resolve;
        }),
    );
    const ui = await mount(save);
    try {
      await ui.change('4');
      await ui.submit();
      await ui.submit();
      expect(save).toHaveBeenCalledTimes(1);
      expect(ui.input.disabled).toBe(true);
      expect(ui.host.querySelector('[role="status"]')).toBeNull();
      await act(async () => settle!(true));
      expect(ui.host.querySelector('[role="status"]')?.textContent).toContain('已保存');
    } finally {
      await ui.close();
    }
  });
  it('does not save without a writable Host and handles connection errors', async () => {
    const unavailable = vi.fn(async () => true);
    const ui = await mount(unavailable, false);
    try {
      await ui.submit();
      expect(ui.input.disabled).toBe(true);
      expect(unavailable).not.toHaveBeenCalled();
    } finally {
      await ui.close();
    }
    const failed = await mount(async () => {
      throw new Error('Connection lost');
    });
    try {
      await failed.change('5');
      await failed.submit();
      expect(failed.host.querySelector('[role="alert"]')?.textContent).toContain('保存失败');
    } finally {
      await failed.close();
    }
  });
});
