// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  return {
    FileTypeIcon: stub,
    writeClipboard: vi.fn(async () => true),
    IconEllipsisOutlineRegular: stub,
    IconChevronDownOutlineRegular: stub,
    IconFolderCloseRegular: stub,
    IconFolderOpenRegular: stub,
    Tooltip: ({ children }: { children: ReactNode }) => children,
    Menu: ({
      anchor,
      items,
      onSelect,
    }: {
      anchor: ReactNode;
      items: {
        type?: string;
        id: string;
        label?: ReactNode;
        text?: ReactNode;
        disabled?: boolean;
      }[];
      onSelect: (id: string) => void;
    }) =>
      createElement(
        'div',
        { role: 'menu' },
        anchor,
        items.map((item) =>
          item.type
            ? createElement('span', { key: item.id }, item.text)
            : createElement(
                'button',
                {
                  key: item.id,
                  role: 'menuitem',
                  disabled: item.disabled,
                  onClick: () => onSelect(item.id),
                },
                item.label,
              ),
        ),
      ),
  };
});
import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives';
import { MemoryFileTree } from '../src/client/memory-file-tree.js';
import { MemoryFileActionButton } from '../src/client/memory-file-actions.js';
import type { HostFileTarget } from '../src/client/host-file-actions.js';
import { zhTranslate } from '../src/client/locale.js';

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
function actions(available = true) {
  return {
    memoryFileTarget: vi.fn(async (_slug: string, path: string): Promise<HostFileTarget> => ({
      path: '/host/memory/' + path,
      relativePath: path,
      kind: path.includes('.') ? 'file' : 'directory',
    })),
    memoryFileApplications: vi.fn(async () => ({
      available,
      applications: available ? [{ id: 'editor', name: 'Editor', default: true, icon: null }] : [],
    })),
    memoryFileOpen: vi.fn(async () => {}),
    memoryFileDownload: vi.fn(async () => {}),
  };
}
const button = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    b.textContent?.includes(text),
  )!;
async function click(element: Element) {
  await act(async () => element.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

describe('Memory file menus', () => {
  it('right-click and keyboard menu do not select a file or expand a directory; More is accessible', async () => {
    const a = actions();
    const select = vi.fn();
    await act(async () =>
      root.render(
        createElement(MemoryFileTree, {
          paths: ['nested/file.txt'],
          selectedPath: undefined,
          onSelect: select,
          actions: a,
          botSlug: 'ada',
          t: zhTranslate,
        }),
      ),
    );
    const folder = container.querySelector<HTMLButtonElement>('[role="treeitem"]')!;
    await act(async () =>
      folder.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
    );
    expect(folder.getAttribute('aria-expanded')).toBe('false');
    expect(
      container
        .querySelector('button[aria-label="文件操作: nested"]')
        ?.getAttribute('aria-expanded'),
    ).toBe('true');
    expect(select).not.toHaveBeenCalled();
    expect(button('用 Editor 打开')).toBeDefined();
    await click(button('用 Editor 打开'));
    expect(a.memoryFileOpen).toHaveBeenCalledWith('ada', 'nested', { application: 'editor' });
    await click(folder);
    const file = container.querySelector<HTMLButtonElement>('[data-path="nested/file.txt"]')!;
    await act(async () =>
      file.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'F10',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(select).not.toHaveBeenCalled();
    expect(
      container
        .querySelector('button[aria-label="文件操作: nested/file.txt"]')
        ?.getAttribute('aria-expanded'),
    ).toBe('true');
    expect(
      container
        .querySelector('button[aria-label="文件操作: nested"]')
        ?.getAttribute('aria-expanded'),
    ).toBe('false');
    await click(button('下载到此设备'));
    expect(a.memoryFileDownload).toHaveBeenCalledWith('ada', 'nested/file.txt');
    expect(
      container.querySelector('button[aria-label="文件操作: nested/file.txt"]'),
    ).not.toBeNull();
    await click(file);
    expect(select).toHaveBeenCalledWith('nested/file.txt');
  });
  it('unavailable Host keeps file download and path copy, and never offers unavailable apps', async () => {
    const a = actions(false);
    await act(async () =>
      root.render(
        createElement(MemoryFileActionButton, {
          actions: a,
          slug: 'ada',
          path: 'file.txt',
          text: 'file.txt',
          t: zhTranslate,
        }),
      ),
    );
    await click(button('file.txt'));
    expect(document.body.textContent).toContain('Host 无法原生打开');
    expect(document.body.textContent).not.toContain('用 Editor 打开');
    expect(button('下载到此设备')).toBeDefined();
    expect(button('复制 Host 路径')).toBeDefined();
    const targetCalls = a.memoryFileTarget.mock.calls.length;
    vi.mocked(writeClipboard).mockResolvedValueOnce(false);
    await click(button('复制 Host 路径'));
    expect(document.body.textContent).toContain('无法复制路径');
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    await click(button('复制 Host 路径'));
    expect(writeClipboard).toHaveBeenLastCalledWith('/host/memory/file.txt');
    expect(a.memoryFileTarget).toHaveBeenCalledTimes(targetCalls);
    expect(document.body.textContent).toContain('已复制 Host 路径');
    await click(button('file.txt'));
    await click(button('下载到此设备'));
    expect(a.memoryFileDownload).toHaveBeenCalledWith('ada', 'file.txt');
  });
  it('a rejected or vanished target offers no executable action and shows the error', async () => {
    const a = actions();
    vi.mocked(a.memoryFileTarget).mockRejectedValue(new Error('file is missing'));
    await act(async () =>
      root.render(
        createElement(MemoryFileActionButton, {
          actions: a,
          slug: 'ada',
          path: 'file.txt',
          t: zhTranslate,
        }),
      ),
    );
    await click(container.querySelector('button')!);
    expect(document.body.textContent).toContain('file is missing');
    expect(document.querySelector('[role="menuitem"]')).toBeNull();
    expect(a.memoryFileOpen).not.toHaveBeenCalled();
  });
});
