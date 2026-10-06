// @vitest-environment jsdom
import {
  act,
  createElement,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  const passthrough = ({ children }: { children?: ReactNode }) => children ?? null;
  return {
    Button: ({
      children,
      variant: _variant,
      size: _size,
      ...props
    }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) =>
      createElement('button', props, children),
    Input: (props: InputHTMLAttributes<HTMLInputElement>) => createElement('input', props),
    Tag: ({ children }: { children?: ReactNode }) =>
      createElement('span', { className: 'tag' }, children),
    Tooltip: passthrough,
    FileTypeIcon: stub,
    IconEllipsisOutlineRegular: stub,
    IconChevronDownOutlineRegular: stub,
    IconFolderCloseRegular: stub,
    IconFolderOpenRegular: stub,
  };
});

import type { BridgeActions } from '../src/client/actions.js';
import { loadMemorySnapshot, parseBotSummary } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import { MemoryFileTree } from '../src/client/memory-file-tree.js';
import { memoryFileTree } from '../src/client/memory-file-tree-model.js';
import { StandingLimitsProfile } from '../src/client/standing-limits-profile.js';
import type { BotSummary } from '../src/client/store.js';

const bot: BotSummary = {
  slug: 'ada',
  displayName: 'Ada',
  roles: [],
  aggregateState: 'idle',
  workspaces: [],
  createdAt: '2026-10-06T00:00:00.000Z',
  standingLimits: { soul: 5000, coreMemory: 3000 },
};

describe('Standing memory', () => {
  it('pins the standing root files above folders in their prompt order', () => {
    const tree = memoryFileTree(
      ['a.md', 'MEMORY.md', 'topics/plan.md', 'SOUL.md', 'topics/MEMORY.md'],
      ['SOUL.md', 'MEMORY.md'],
    );
    expect(tree.map((node) => node.path)).toEqual(['SOUL.md', 'MEMORY.md', 'topics', 'a.md']);
    expect(tree[2]?.children.map((node) => node.path)).toEqual([
      'topics/MEMORY.md',
      'topics/plan.md',
    ]);
  });

  it('shows the Standing badge and usage, marking an over-limit file', () => {
    const html = renderToStaticMarkup(
      createElement(MemoryFileTree, {
        paths: ['notes.md', 'MEMORY.md', 'SOUL.md'],
        standing: [
          { path: 'SOUL.md', role: 'soul', chars: 1860, limit: 5000 },
          { path: 'MEMORY.md', role: 'coreMemory', chars: 3600, limit: 3000 },
        ],
        selectedPath: undefined,
        onSelect: undefined,
        t: zhTranslate,
      }),
    );
    const container = document.createElement('div');
    container.innerHTML = html;
    const rows = [...container.querySelectorAll('[role="treeitem"]')];
    expect(rows.map((row) => row.getAttribute('data-path'))).toEqual([
      'SOUL.md',
      'MEMORY.md',
      'notes.md',
    ]);
    expect(rows[0]?.textContent).toContain('常驻');
    expect(rows[0]?.textContent).toContain('37% · 1,860/5,000');
    expect(rows[1]?.querySelector('.bh-memory-standing-over')?.textContent).toContain(
      '120% · 3,600/3,000',
    );
    expect(rows[2]?.querySelector('.bh-memory-standing')).toBeNull();
  });

  it('parses standing limits and usage from the bridge', async () => {
    expect(
      parseBotSummary({
        slug: 'ada',
        displayName: 'Ada',
        standingLimits: { soul: 8000, coreMemory: 1200 },
      })?.standingLimits,
    ).toEqual({ soul: 8000, coreMemory: 1200 });
    const call = vi.fn(async () => ({
      ok: true as const,
      value: {
        snapshot: {
          head: null,
          files: ['MEMORY.md'],
          provisional: false,
          standing: [
            { path: 'MEMORY.md', role: 'coreMemory', chars: 12, limit: 3000 },
            { path: 'bad', role: 'other', chars: 1, limit: 1 },
          ],
        },
      },
    }));
    const snapshot = await loadMemorySnapshot(call, 'channel-1');
    expect(snapshot.standing).toEqual([
      { path: 'MEMORY.md', role: 'coreMemory', chars: 12, limit: 3000 },
    ]);
  });

  it('saves new limits, explains their size and rejects out-of-range values', async () => {
    const setStandingLimits = vi.fn(
      async (_slug: string, limits: BotSummary['standingLimits']) => ({
        ...bot,
        ...(limits === undefined ? {} : { standingLimits: limits }),
      }),
    );
    const actions = { setStandingLimits } as unknown as BridgeActions;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () =>
      root.render(createElement(StandingLimitsProfile, { bot, actions, t: zhTranslate })),
    );
    const inputs = [...host.querySelectorAll<HTMLInputElement>('input')];
    const save = (): HTMLButtonElement =>
      [...host.querySelectorAll<HTMLButtonElement>('button')].find(
        (button) => button.textContent === zhTranslate('standingLimits.save'),
      )!;
    expect(host.textContent).toContain('约 5,000 个汉字，或约 830 个英文单词');
    expect(save().disabled).toBe(true);

    const type = async (input: HTMLInputElement, value: string): Promise<void> => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      await act(async () => {
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };
    await type(inputs[1]!, '100');
    expect(host.textContent).toContain('请输入 500 到 50,000 之间的整数');
    expect(save().disabled).toBe(true);

    await type(inputs[1]!, '1200');
    expect(save().disabled).toBe(false);
    await act(async () => save().click());
    expect(setStandingLimits).toHaveBeenCalledWith('ada', { soul: 5000, coreMemory: 1200 });
    expect(host.textContent).toContain('已保存，下一个 Session 生效');
    expect(save().disabled).toBe(true);
    act(() => root.unmount());
    host.remove();
  });
});
