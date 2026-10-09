// @vitest-environment jsdom
import {
  act,
  createElement,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  return {
    IconCodeOutlineRegular: () => null,
    Button: ({
      children,
      variant: _variant,
      size: _size,
      ...props
    }: ButtonHTMLAttributes<HTMLButtonElement> & {
      variant?: string;
      size?: string;
    }) => createElement('button', props, children),
    IconAgentPresetOutline16: stub,
    IconAgentPresetOutlineRegular: stub,
    IconCheckOutlineRegular: stub,
    IconBranchOutlineRegular: stub,
    IconChevronLeftOutlineRegular: stub,
    IconChevronDownOutline14: stub,
    IconChevronDownOutlineRegular: stub,
    IconCloseFill14: stub,
    IconCopyOutline16: stub,
    IconCopyOutlineRegular: stub,
    IconCloseOutline16: stub,
    IconEllipsisOutline16: stub,
    IconEllipsisOutlineRegular: stub,
    IconFolderCloseRegular: stub,
    IconFolderOpenRegular: stub,
    IconFolderOpenOutline16: stub,
    IconNewChatOutline16: stub,
    IconPanelLeftOutline16: stub,
    IconPanelLeftOutlineRegular: stub,
    IconPaperclipOutlineRegular: stub,
    IconPlusOutline16: stub,
    IconRefreshOutlineRegular: stub,
    IconSearchOutline16: stub,
    IconSendOutline16: stub,
    IconSendOutlineRegular: stub,
    IconTrashOutline16: stub,
    FileTypeIcon: stub,
    ImageLightbox: stub,
    Input: (props: InputHTMLAttributes<HTMLInputElement>) => createElement('input', props),
    Menu: ({
      anchor,
      open,
      items = [],
      onSelect,
      children,
    }: {
      anchor: ReactNode;
      open: boolean;
      items?: { id: string; label: string }[];
      onSelect?: (id: string) => void;
      children?: ReactNode;
    }) =>
      createElement(
        'span',
        null,
        anchor,
        open
          ? createElement(
              'div',
              { role: 'menu' },
              ...items.map((item) =>
                createElement(
                  'button',
                  { key: item.id, role: 'menuitem', onClick: () => onSelect?.(item.id) },
                  item.label,
                ),
              ),
              children,
            )
          : null,
      ),
    MarkdownText: stub,
    Modal: ({
      open,
      title,
      children,
      footer,
      onClose,
    }: {
      open: boolean;
      title: string;
      children?: ReactNode;
      footer?: ReactNode;
      onClose: () => void;
    }) =>
      open
        ? createElement(
            'div',
            { role: 'dialog', 'aria-label': title },
            children,
            footer,
            createElement('button', { onClick: onClose }, 'Close'),
          )
        : null,
    StateDot: stub,
    Tag: stub,
    Tooltip: ({ children }: { children: ReactNode }) => children,
    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

import type { MemoryWorkingChange } from '../src/client/bridge.js';
import type { BridgeActions } from '../src/client/actions.js';
import type { OnboardingSnapshot } from '../../core/src/onboarding/types.js';
import { zhTranslate } from '../src/client/locale.js';
import { OnboardingMemory, OnboardingMemoryNavigation } from '../src/client/onboarding-memory.js';
import { onboardingFor } from '../src/client/onboarding.js';
import { store, type ChannelSummary } from '../src/client/store.js';

const channel: ChannelSummary = {
  id: 'dm-memory',
  botSlug: 'memory-bot',
  type: 'dm',
  name: 'Memory Bot',
  members: ['memory-bot'],
  createdAt: '',
  updatedAt: '',
};
const receipt: OnboardingSnapshot = {
  profileId: 'memory-profile',
  tutorial: 'skipped',
  completed: true,
  preparation: 'ready',
  channelId: channel.id,
};
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  store.setRoster(
    [
      {
        slug: 'memory-bot',
        displayName: 'Memory Bot',
        roles: [],
        aggregateState: 'idle',
        workspaces: [],
        createdAt: '',
      },
    ],
    [channel],
  );
  store.setConversation({ channel, sending: false });
  store.select({ kind: 'channel', channelId: channel.id });
  store.setConversation({ channel, sending: false });
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  sessionStorage.clear();
});
function fixtures(completed = true) {
  const actions = {
    onboarding: vi.fn().mockResolvedValue({ ...receipt, completed }),
    load: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(true),
    openChannel: vi.fn().mockResolvedValue(undefined),
    memorySnapshot: vi
      .fn()
      .mockResolvedValue({ head: null, files: ['MEMORY.md'], provisional: false, standing: [] }),
    memoryGitGraph: vi.fn().mockResolvedValue({
      head: null,
      currentBranch: 'main',
      branches: ['main'],
      dirty: false,
      commits: [],
      hasMore: false,
    }),
    memoryWorkingChanges: vi.fn<() => Promise<MemoryWorkingChange[]>>().mockResolvedValue([]),
    memoryRecoveryHistory: vi.fn().mockResolvedValue([]),
  };
  const bridge = actions as unknown as BridgeActions;
  const navigation = { file: vi.fn(), commit: vi.fn(), working: vi.fn() };
  const render = async (connected = true) => {
    await act(async () => {
      await onboardingFor(bridge).enter();
      root.render(
        createElement(
          OnboardingMemoryNavigation.Provider,
          { value: connected ? navigation : undefined },
          createElement(OnboardingMemory, {
            actions: bridge,
            channelId: channel.id,
            t: zhTranslate,
          }),
        ),
      );
    });
  };
  return { actions, bridge, navigation, render };
}
function button(label: string) {
  const found = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim() === label,
  );
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
const click = async (label: string) => act(async () => button(label).click());
async function preference(value: string) {
  const input = container.querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('optional onboarding Memory', () => {
  it('requires completed onboarding, a current Human–Bot DM, and normal reader navigation', async () => {
    const incomplete = fixtures(false);
    await incomplete.render();
    expect(container.textContent).toBe('');
    const complete = fixtures();
    await complete.render(false);
    expect(container.textContent).toBe('');
    await complete.render();
    expect(button('探索记忆')).toBeDefined();
    const readOnly = { ...channel };
    delete readOnly.botSlug;
    for (const next of [
      { ...channel, type: 'group' as const },
      readOnly,
      { ...channel, id: 'another-dm' },
    ]) {
      await act(async () => store.setConversation({ channel: next }));
      expect(container.textContent).toBe('');
    }
    await act(async () => store.setConversation({ channel }));
    for (const unavailable of [{ paused: true }, { deleted: true }]) {
      await act(async () =>
        store.setRoster(
          store.getSnapshot().bots.map((bot) => ({ ...bot, ...unavailable })),
          [channel],
        ),
      );
      expect(container.textContent).toBe('');
    }
    expect(complete.actions.send).not.toHaveBeenCalled();
  });
  it('opens voluntarily and dismisses quietly without changing completion or sending a request', async () => {
    const { render, actions, bridge } = fixtures();
    await render();
    expect(container.querySelector('[role=dialog]')).toBeNull();
    await click('探索记忆');
    expect(container.textContent).toContain('初始模板和 Bot 的回复不代表已保存');
    await click('暂时不体验');
    expect(container.querySelector('[role=dialog]')).toBeNull();
    expect(onboardingFor(bridge).getSnapshot().receipt?.completed).toBe(true);
    expect(actions.onboarding.mock.calls.every((args) => args[1] === undefined)).toBe(true);
    expect(actions.memorySnapshot).not.toHaveBeenCalled();
    expect(actions.send).not.toHaveBeenCalled();
  });
  it('reads actual scoped files and opens a selected file in the normal reader', async () => {
    const { render, actions, navigation } = fixtures();
    await render();
    await click('探索记忆');
    await act(async () => container.querySelector<HTMLButtonElement>('.bh-card-main')!.click());
    expect(actions.memorySnapshot).toHaveBeenCalledWith(channel.id);
    expect(container.textContent).toContain('MEMORY.md');
    await act(async () => container.querySelector<HTMLButtonElement>('[role=treeitem]')!.click());
    expect(navigation.file).toHaveBeenCalledExactlyOnceWith('MEMORY.md');
    expect(container.querySelector('[role=dialog]')).toBeNull();
    expect(actions.send).not.toHaveBeenCalled();
  });
  it('shows real empty changes and read failures without inventing saved preferences', async () => {
    const { render, actions } = fixtures();
    await render();
    await click('探索记忆');
    await act(async () =>
      container.querySelectorAll<HTMLButtonElement>('.bh-card-main')[2]!.click(),
    );
    expect(actions.memoryWorkingChanges).toHaveBeenCalledWith(channel.id);
    expect(container.textContent).toContain('没有未提交的记忆变更');
    await click('返回选项');
    actions.memoryWorkingChanges.mockRejectedValueOnce(Error('Memory unavailable'));
    await act(async () =>
      container.querySelectorAll<HTMLButtonElement>('.bh-card-main')[2]!.click(),
    );
    expect(container.querySelector('[role=alert]')?.textContent).toContain('更新失败');
    expect(actions.send).not.toHaveBeenCalled();
  });
  it('opens a real working change in the normal diff reader', async () => {
    const { render, actions, navigation } = fixtures();
    const change: MemoryWorkingChange = { path: 'MEMORY.md', kind: 'unstaged', status: 'M' };
    actions.memoryWorkingChanges.mockResolvedValue([change]);
    await render();
    await click('探索记忆');
    await act(async () =>
      container.querySelectorAll<HTMLButtonElement>('.bh-card-main')[2]!.click(),
    );
    await act(async () => container.querySelector<HTMLButtonElement>('.bh-memory-row')!.click());
    expect(navigation.working).toHaveBeenCalledExactlyOnceWith({ ...change, kind: 'current' });
    expect(container.querySelector('[role=dialog]')).toBeNull();
  });
  it('sends the freeform preference only on explicit confirmation through normal actions', async () => {
    const { render, actions, bridge } = fixtures();
    await render();
    await click('探索记忆');
    await act(async () =>
      container.querySelectorAll<HTMLButtonElement>('.bh-card-main')[1]!.click(),
    );
    expect(button('发送给 Bot').disabled).toBe(true);
    await preference('  先给结论，再补充细节。  ');
    expect(actions.send).not.toHaveBeenCalled();
    await act(async () => store.setConversation({ sending: true }));
    expect(button('发送给 Bot').disabled).toBe(true);
    await act(async () => store.setConversation({ sending: false }));
    await click('发送给 Bot');
    expect(actions.send).toHaveBeenCalledExactlyOnceWith(
      zhTranslate('onboarding.memory.request', { preference: '先给结论，再补充细节。' }),
    );
    expect(onboardingFor(bridge).getSnapshot().receipt?.completed).toBe(true);
    expect(container.querySelector('[role=dialog]')).toBeNull();
  });
  it('keeps an unsuccessful request editable on reopen and exposes the normal send error', async () => {
    const { render, actions, bridge } = fixtures();
    actions.send.mockRejectedValueOnce(Error('Model unavailable'));
    await render();
    await click('探索记忆');
    await act(async () =>
      container.querySelectorAll<HTMLButtonElement>('.bh-card-main')[1]!.click(),
    );
    await preference('Concise answers');
    await click('发送给 Bot');
    expect(onboardingFor(bridge).getSnapshot().error).toBe('Model unavailable');
    await click('探索记忆');
    await act(async () =>
      container.querySelectorAll<HTMLButtonElement>('.bh-card-main')[1]!.click(),
    );
    expect(container.querySelector('input')?.value).toBe('Concise answers');
    expect(onboardingFor(bridge).getSnapshot().receipt?.completed).toBe(true);
  });
});
