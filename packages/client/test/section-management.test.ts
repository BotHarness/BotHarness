import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({
  buttons: [] as Array<Record<string, unknown>>,
  inputs: [] as Array<Record<string, unknown>>,
  modals: [] as Array<Record<string, unknown>>,
}));

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  const icon = (name: string) => () => createElement('span', { 'data-icon': name });
  return {
    Button: (props: Record<string, unknown>) => {
      captured.buttons.push(props);
      return null;
    },
    IconCheckOutline16: icon('IconCheckOutline16'),
    IconEditOutline16: stub,
    IconTrashOutline16: stub,
    Modal: (props: Record<string, unknown>) => {
      captured.modals.push(props);
      return props['open'] === true
        ? createElement('div', null, props['children'] as never, props['footer'] as never)
        : null;
    },
  };
});

vi.mock('../src/client/name-input.js', () => ({
  NameInput: (props: Record<string, unknown>) => {
    captured.inputs.push(props);
    return null;
  },
}));

import type { MenuItem } from '@deepseek-ai/dsh-client-ui-primitives';

import { zh, type BotHarnessKey } from '../src/client/locale.js';
import {
  channelMoveMenuItems,
  CreateChannelModal,
  CreateSectionModal,
  DANGER_ACTION_CLASS,
  globalSortMenuItems,
  SectionDeleteModal,
  NEW_SECTION_MOVE_TARGET,
  SectionRenameModal,
  sectionMenuItems,
  UNGROUPED_MOVE_TARGET,
} from '../src/client/section-management.js';

const SECTION = { id: 's1', name: '工作流', channelIds: [] };

const t = (key: BotHarnessKey): string => zh[key];

function lastButton(label: string): Record<string, unknown> {
  const found = captured.buttons.findLast((button) => button['children'] === label);
  if (found === undefined) throw new Error(`button ${label} not rendered`);
  return found;
}

function lastInput(): Record<string, unknown> {
  const found = captured.inputs.at(-1);
  if (found === undefined) throw new Error('input not rendered');
  return found;
}

function lastModal(): Record<string, unknown> {
  const found = captured.modals.at(-1);
  if (found === undefined) throw new Error('modal not rendered');
  return found;
}

function key(keyValue: string): { key: string; preventDefault: () => void } {
  return { key: keyValue, preventDefault: () => undefined };
}

beforeEach(() => {
  captured.buttons.length = 0;
  captured.inputs.length = 0;
  captured.modals.length = 0;
});

describe('section menus', () => {
  it('orders the global menu as sort modes followed by hidden Channel management', () => {
    expect(globalSortMenuItems(t).map((item) => ('id' in item ? item.id : undefined))).toEqual([
      'sort-label',
      'updated',
      'manual',
      'roster-separator',
      'hidden',
    ]);
  });

  it('orders the section menu: sort modes, rename, danger delete last', () => {
    const items = sectionMenuItems(t);
    expect(items.map((item) => ('id' in item ? item.id : undefined))).toEqual([
      'sort-label',
      'updated',
      'manual',
      'inherit',
      'section-separator',
      'move-up',
      'move-down',
      'section-action-separator',
      'rename',
      'delete',
    ]);
    const last = items.at(-1);
    expect(last !== undefined && 'danger' in last && last.danger === true).toBe(true);
    const bounded = sectionMenuItems(t, { canMoveUp: false, canMoveDown: true });
    const moveUp = bounded.find((item) => 'id' in item && item.id === 'move-up');
    const moveDown = bounded.find((item) => 'id' in item && item.id === 'move-down');
    expect(moveUp !== undefined && 'disabled' in moveUp && moveUp.disabled).toBe(true);
    expect(moveDown !== undefined && 'disabled' in moveDown && moveDown.disabled).toBe(false);
  });
});

describe('channel move menu', () => {
  const sections = [
    { id: 's1', name: '工作流', channelIds: [] },
    { id: 's2', name: '研究', channelIds: [] },
  ];

  function moveItem(currentSectionId: string | undefined): MenuItem {
    const [move] = channelMoveMenuItems(t, sections, currentSectionId);
    if (move === undefined || !('id' in move) || move.id !== 'move' || !('label' in move)) {
      throw new Error('move menu not built');
    }
    return move;
  }

  it('lists every section plus 未分组 under one 移动到 submenu', () => {
    const move = moveItem('s2');

    expect(move.label).toBe('移动到');
    expect(move.submenu?.map((item) => item.id)).toEqual([
      NEW_SECTION_MOVE_TARGET,
      's1',
      's2',
      UNGROUPED_MOVE_TARGET,
    ]);
  });

  it('marks the current scope with the trailing check and only that row', () => {
    const label = (item: MenuItem): string => renderToStaticMarkup(item.label as never);
    const inSection = (moveItem('s2').submenu ?? []).map(label);
    expect(inSection[2]).toContain('data-icon="IconCheckOutline16"');
    expect(inSection[1]).not.toContain('data-icon="IconCheckOutline16"');
    expect(inSection[3]).not.toContain('data-icon="IconCheckOutline16"');

    const ungrouped = (moveItem(undefined).submenu ?? []).map(label);
    expect(ungrouped[3]).toContain('data-icon="IconCheckOutline16"');
    expect(ungrouped[0]).not.toContain('data-icon="IconCheckOutline16"');
  });
});

describe('section rename modal', () => {
  it('submits the trimmed draft on Enter', () => {
    const onRename = vi.fn();
    renderToStaticMarkup(
      createElement(SectionRenameModal, {
        section: { ...SECTION, name: '  旧名  ' },
        onCancel: () => undefined,
        onRename,
      }),
    );

    (lastInput()['onKeyDown'] as (event: unknown) => void)(key('Enter'));

    expect(onRename).toHaveBeenCalledWith('旧名');
  });

  it('submits through the primary button and ignores other keys', () => {
    const onRename = vi.fn();
    renderToStaticMarkup(
      createElement(SectionRenameModal, {
        section: { ...SECTION, name: '新名' },
        onCancel: () => undefined,
        onRename,
      }),
    );

    (lastInput()['onKeyDown'] as (event: unknown) => void)(key('a'));
    expect(onRename).not.toHaveBeenCalled();
    (lastButton('重命名')['onClick'] as () => void)();
    expect(onRename).toHaveBeenCalledWith('新名');
  });

  it('defers Enter while an IME composition is open', () => {
    const onRename = vi.fn();
    renderToStaticMarkup(
      createElement(SectionRenameModal, {
        section: { ...SECTION, name: '输入中' },
        onCancel: () => undefined,
        onRename,
      }),
    );

    (lastInput()['onCompositionStart'] as () => void)();
    (lastInput()['onKeyDown'] as (event: unknown) => void)(key('Enter'));
    expect(onRename).not.toHaveBeenCalled();
    (lastInput()['onCompositionEnd'] as () => void)();
    (lastInput()['onKeyDown'] as (event: unknown) => void)(key('Enter'));
    expect(onRename).toHaveBeenCalledTimes(1);
  });

  it('rejects a blank draft from both Enter and the disabled confirm button', () => {
    const onRename = vi.fn();
    renderToStaticMarkup(
      createElement(SectionRenameModal, {
        section: { ...SECTION, name: '   ' },
        onCancel: () => undefined,
        onRename,
      }),
    );

    expect(lastButton('重命名')['disabled']).toBe(true);
    (lastButton('重命名')['onClick'] as () => void)();
    (lastInput()['onKeyDown'] as (event: unknown) => void)(key('Enter'));
    expect(onRename).not.toHaveBeenCalled();
  });

  it('cancels through the footer button and the modal close path', () => {
    const onCancel = vi.fn();
    renderToStaticMarkup(
      createElement(SectionRenameModal, {
        section: SECTION,
        onCancel,
        onRename: () => undefined,
      }),
    );

    (lastButton('取消')['onClick'] as () => void)();
    (lastModal()['onClose'] as () => void)();

    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(lastModal()['title']).toBe('重命名频道分组');
    expect(lastModal()['closeLabel']).toBe('关闭');
  });
});

describe('section delete modal', () => {
  it('renders the fallback copy, parks focus on cancel, and wires both actions', () => {
    const onDelete = vi.fn();
    const onCancel = vi.fn();
    renderToStaticMarkup(
      createElement(SectionDeleteModal, {
        section: { ...SECTION, name: '工作流', channelIds: ['c1'] },
        onCancel,
        onDelete,
      }),
    );

    expect(lastModal()['title']).toBe('删除频道分组');
    expect(lastModal()['description']).toContain('工作流');
    expect(lastModal()['description']).toContain('其中的频道会移出分组、变为未分组频道');
    expect(lastButton('取消')['autoFocus']).toBe(true);
    expect(lastButton('删除')['variant']).toBe('outline');
    expect(lastButton('删除')['className']).toBe(DANGER_ACTION_CLASS);
    expect(lastButton('删除')['autoFocus']).toBeUndefined();

    (lastButton('删除')['onClick'] as () => void)();
    (lastButton('取消')['onClick'] as () => void)();

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('section create modal', () => {
  it('renders the 频道分组 copy with a focused blank name field', () => {
    renderToStaticMarkup(
      createElement(CreateSectionModal, { onCancel: () => undefined, onCreate: () => undefined }),
    );

    expect(lastModal()['title']).toBe('创建频道分组');
    expect(lastModal()['description']).toContain('分组');
    expect(lastInput()['autoFocus']).toBe(true);
    expect(lastInput()['placeholder']).toBe('分组名称');
    expect(lastInput()['aria-label']).toBe('分组名称');
  });

  it('keeps Enter, the create button, and cancel inert on a blank draft', () => {
    const onCreate = vi.fn();
    const onCancel = vi.fn();
    renderToStaticMarkup(createElement(CreateSectionModal, { onCancel, onCreate }));

    expect(lastButton('创建')['disabled']).toBe(true);
    (lastInput()['onKeyDown'] as (event: unknown) => void)(key('Enter'));
    (lastButton('创建')['onClick'] as () => void)();
    expect(onCreate).not.toHaveBeenCalled();
    (lastButton('取消')['onClick'] as () => void)();
    (lastModal()['onClose'] as () => void)();
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});

describe('channel create modal', () => {
  it('titles an ungrouped channel and a section-scoped channel', () => {
    renderToStaticMarkup(
      createElement(CreateChannelModal, {
        onCancel: () => undefined,
        onCreate: async () => undefined,
      }),
    );
    expect(lastModal()['title']).toBe('创建频道');
    expect(lastModal()['description']).toContain('频道');

    renderToStaticMarkup(
      createElement(CreateChannelModal, {
        sectionName: '工作流',
        onCancel: () => undefined,
        onCreate: async () => undefined,
      }),
    );
    expect(lastModal()['title']).toBe('在「工作流」中创建频道');
  });

  it('keeps the blank draft inert and closes through cancel and Escape', () => {
    const onCreate = vi.fn(async () => undefined);
    const onCancel = vi.fn();
    renderToStaticMarkup(createElement(CreateChannelModal, { onCancel, onCreate }));

    expect(lastButton('创建')['disabled']).toBe(true);
    (lastInput()['onKeyDown'] as (event: unknown) => void)(key('Enter'));
    expect(onCreate).not.toHaveBeenCalled();
    (lastButton('取消')['onClick'] as () => void)();
    (lastModal()['onClose'] as () => void)();
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
