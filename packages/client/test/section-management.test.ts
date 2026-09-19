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
  return {
    Button: (props: Record<string, unknown>) => {
      captured.buttons.push(props);
      return null;
    },
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

import {
  CreateChannelModal,
  CreateSectionModal,
  DANGER_ACTION_CLASS,
  globalSortMenuItems,
  SectionDeleteModal,
  SectionRenameModal,
  sectionMenuItems,
} from '../src/client/section-management.js';

const SECTION = { id: 's1', name: '工作流', channels: [] };

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
  it('orders the global default menu as heading plus the two concrete modes', () => {
    expect(globalSortMenuItems().map((item) => ('id' in item ? item.id : undefined))).toEqual([
      'sort-label',
      'auto',
      'manual',
    ]);
  });

  it('orders the section menu: sort modes, rename, danger delete last', () => {
    const items = sectionMenuItems();
    expect(items.map((item) => ('id' in item ? item.id : undefined))).toEqual([
      'sort-label',
      'auto',
      'manual',
      'inherit',
      'section-separator',
      'rename',
      'delete',
    ]);
    const last = items.at(-1);
    expect(last !== undefined && 'danger' in last && last.danger === true).toBe(true);
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
        section: { ...SECTION, name: '工作流', channels: ['c1'] },
        onCancel,
        onDelete,
      }),
    );

    expect(lastModal()['title']).toBe('删除频道分组');
    expect(lastModal()['description']).toContain('工作流');
    expect(lastModal()['description']).toContain('其中的频道会回到未分组');
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
