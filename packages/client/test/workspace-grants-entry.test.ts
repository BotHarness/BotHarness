// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import type { BridgeActions } from '../src/client/actions.js';
import { zhTranslate } from '../src/client/locale.js';
import { WorkspaceGrantsEntry } from '../src/client/workspace-grants-entry.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ children, ...props }: { children: ReactNode }) =>
    createElement('button', props, children),
  Switch: ({
    checked,
    disabled,
    label,
    onChange,
  }: {
    checked: boolean;
    disabled?: boolean;
    label: string;
    onChange(value: boolean): void;
  }) =>
    createElement('input', {
      type: 'checkbox',
      role: 'switch',
      checked,
      disabled,
      'aria-label': label,
      onChange: (event: { currentTarget: { checked: boolean } }) =>
        onChange(event.currentTarget.checked),
    }),
  Tag: ({ children }: { children: ReactNode }) => createElement('span', null, children),
  Modal: () => null,
  Input: () => null,
  IconChevronDownOutlineRegular: () => null,
  IconCloseOutlineRegular: () => null,
  IconFolderOpenOutlineRegular: () => null,
}));

describe('Workspace Grant sidebar', () => {
  it('keeps write permission off until the Host confirms and preserves it when revocation fails', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    let grant = {
      id: 'write-grant',
      botSlug: 'write-test',
      workspaceId: 'write-workspace',
      workspacePath: '/tmp/write-project',
      workspaceTitle: 'write project',
      createdAt: '2026-10-01T00:00:00.000Z',
      orchestratorWrite: false,
      writeRevision: 0,
    };
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const setWorkspaceGrantWrite = vi
      .fn()
      .mockImplementationOnce(async () => {
        await pending;
        grant = { ...grant, orchestratorWrite: true, writeRevision: 1 };
        return grant;
      })
      .mockRejectedValueOnce(new Error('Host rejected permission change'));
    const actions = {
      listWorkspaceOptions: vi.fn(async () => []),
      listWorkspaceGrants: vi.fn(async () => [grant]),
      memoryDirectory: vi.fn(async () => '/tmp/memory'),
      listToolApprovalRules: vi.fn(async () => []),
      assignmentAccess: vi.fn(async () => ({ mode: 'workspace-write' })),
      setWorkspaceGrantWrite,
    } as unknown as BridgeActions;
    try {
      await act(async () =>
        root.render(
          createElement(WorkspaceGrantsEntry, {
            scope: 'personabot',
            channelId: 'dm-write-test',
            botSlug: 'write-test',
            actions,
            t: zhTranslate,
          }),
        ),
      );
      const expand = Array.from(
        container.querySelectorAll<HTMLButtonElement>('button.bh-workspace-folder-toggle'),
      ).find((button) => button.querySelector('.bh-card-title')?.textContent === 'write project')!;
      act(() => expand.click());
      const toggle = () =>
        container.querySelector('input[aria-label*="write project"]') as HTMLInputElement;
      expect(toggle().checked).toBe(false);
      await act(async () => toggle().click());
      expect(setWorkspaceGrantWrite).toHaveBeenCalledWith('write-test', 'write-grant', true);
      expect(toggle().checked).toBe(false);
      expect(toggle().disabled).toBe(true);
      await act(async () => {
        release();
        await pending;
      });
      expect(toggle().checked).toBe(true);
      expect(toggle().disabled).toBe(false);
      await act(async () => toggle().click());
      expect(setWorkspaceGrantWrite).toHaveBeenLastCalledWith('write-test', 'write-grant', false);
      expect(toggle().checked).toBe(true);
      expect(toggle().disabled).toBe(false);
      expect(container.textContent).toContain('Host rejected permission change');
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
  it('shows cached Grants immediately when returning to the same PersonaBot', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const grant = {
      id: 'grant-cached',
      botSlug: 'ada',
      workspaceId: 'workspace-cached',
      workspacePath: '/tmp/cached',
      workspaceTitle: 'cached project',
      createdAt: '2026-09-25T00:00:00.000Z',
    };
    const actions = {
      listWorkspaceGrants: vi
        .fn()
        .mockResolvedValueOnce([grant])
        .mockImplementation(() => new Promise<never>(() => undefined)),
      listWorkspaceOptions: vi.fn(async () => []),
      memoryDirectory: vi.fn(async () => '/tmp/memory'),
      listToolApprovalRules: vi.fn(async () => []),
      assignmentAccess: vi.fn(async () => ({ mode: 'workspace-write' })),
    } as unknown as BridgeActions;
    const props = {
      scope: 'personabot' as const,
      channelId: 'dm-ada',
      botSlug: 'ada',
      actions,
      t: zhTranslate,
    };
    try {
      await act(async () => root.render(createElement(WorkspaceGrantsEntry, props)));
      expect(container.textContent).toContain('cached project');
      act(() => root.render(null));
      act(() => root.render(createElement(WorkspaceGrantsEntry, props)));
      expect(container.textContent).toContain('cached project');
      expect(container.querySelector('.bh-skeleton')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it('shows active Grants while unrelated workspace data is still loading', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const actions = {
      listWorkspaceOptions: vi.fn(() => new Promise<never>(() => undefined)),
      listWorkspaceGrants: vi.fn(async () => [
        {
          id: 'grant-1',
          botSlug: 'ada',
          workspaceId: 'workspace-1',
          workspacePath: '/tmp/project',
          workspaceTitle: 'project',
          createdAt: '2026-09-25T00:00:00.000Z',
        },
      ]),
      memoryDirectory: vi.fn(async () => '/tmp/memory'),
      listToolApprovalRules: vi.fn(async () => []),
      assignmentAccess: vi.fn(async () => ({ mode: 'workspace-write' })),
    } as unknown as BridgeActions;
    try {
      await act(async () =>
        root.render(
          createElement(WorkspaceGrantsEntry, {
            scope: 'personabot',
            channelId: 'dm-ada',
            botSlug: 'ada',
            actions,
            t: zhTranslate,
          }),
        ),
      );
      expect(container.querySelector('button[aria-label*="project"]')).toBeTruthy();
      expect(container.textContent).not.toContain('正在加载工作区');
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it('shows a successful revoke immediately even when sidebar refresh stalls', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const grant = {
      id: 'grant-1',
      botSlug: 'ada',
      workspaceId: 'workspace-1',
      workspacePath: '/tmp/project',
      workspaceTitle: 'project',
      createdAt: '2026-09-25T00:00:00.000Z',
    };
    const actions = {
      listWorkspaceOptions: vi.fn(async () => []),
      listWorkspaceGrants: vi
        .fn()
        .mockResolvedValueOnce([grant])
        .mockResolvedValue([{ ...grant, revokedAt: '2026-09-25T00:01:00.000Z' }]),
      memoryDirectory: vi
        .fn()
        .mockResolvedValueOnce('/tmp/memory')
        .mockImplementation(() => new Promise<never>(() => undefined)),
      listToolApprovalRules: vi.fn(async () => []),
      assignmentAccess: vi.fn(async () => ({ mode: 'workspace-write' })),
      revokeWorkspaceGrant: vi.fn(async () => ({
        ...grant,
        revokedAt: '2026-09-25T00:01:00.000Z',
      })),
    } as unknown as BridgeActions;
    try {
      await act(async () =>
        root.render(
          createElement(WorkspaceGrantsEntry, {
            scope: 'personabot',
            channelId: 'dm-ada',
            botSlug: 'ada',
            actions,
            t: zhTranslate,
          }),
        ),
      );
      const remove = container.querySelector('button[aria-label*="project"]') as HTMLButtonElement;
      expect(remove).toBeTruthy();
      vi.useFakeTimers();
      await act(async () => {
        remove.click();
        await Promise.resolve();
      });
      expect(container.querySelector('button[aria-label*="project"]')).toBeNull();
      await act(async () => {
        vi.advanceTimersByTime(15_001);
        await Promise.resolve();
      });
      expect(container.textContent).not.toContain('操作等待超时');
    } finally {
      vi.useRealTimers();
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it('shows progress and recovers if revocation never settles', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const revokeWorkspaceGrant = vi.fn(() => new Promise<never>(() => undefined));
    const actions = {
      listWorkspaceOptions: vi.fn(async () => []),
      listWorkspaceGrants: vi.fn(async () => [
        {
          id: 'grant-1',
          botSlug: 'ada',
          workspaceId: 'workspace-1',
          workspacePath: '/tmp/project',
          workspaceTitle: 'project',
          createdAt: '2026-09-25T00:00:00.000Z',
        },
      ]),
      memoryDirectory: vi.fn(async () => '/tmp/memory'),
      listToolApprovalRules: vi.fn(async () => []),
      assignmentAccess: vi.fn(async () => ({ mode: 'workspace-write' })),
      revokeWorkspaceGrant,
    } as unknown as BridgeActions;
    try {
      await act(async () =>
        root.render(
          createElement(WorkspaceGrantsEntry, {
            scope: 'personabot',
            channelId: 'dm-ada',
            botSlug: 'ada',
            actions,
            t: zhTranslate,
          }),
        ),
      );
      const remove = container.querySelector('button[aria-label*="project"]') as HTMLButtonElement;
      expect(remove).toBeTruthy();
      vi.useFakeTimers();
      act(() => remove.click());
      expect(revokeWorkspaceGrant).toHaveBeenCalledWith('ada', 'grant-1');
      expect(container.textContent).toContain('正在处理工作区操作');
      expect(remove.disabled).toBe(true);
      await act(async () => {
        vi.advanceTimersByTime(15_001);
        await Promise.resolve();
      });
      expect(container.textContent).toContain('操作等待超时');
      expect(remove.disabled).toBe(false);
    } finally {
      vi.useRealTimers();
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
