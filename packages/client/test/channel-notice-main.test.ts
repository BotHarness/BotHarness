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
    IconPlusOutlineRegular: stub,
    IconBranchOutlineRegular: stub,
    IconChevronLeftOutlineRegular: stub,
    IconChevronRightOutlineRegular: stub,
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
    MenuSurface: ({ children }: { children: ReactNode }) =>
      createElement('div', { role: 'menu' }, children),
    MenuItemButton: ({ children, onSelect }: { children: ReactNode; onSelect: () => void }) =>
      createElement('button', { role: 'menuitem', onClick: onSelect }, children),
    MarkdownText: stub,
    Modal: stub,
    StateDot: stub,
    Tag: stub,
    Tooltip: ({ children }: { children: ReactNode }) => children,
    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

import type { BridgeActions } from '../src/client/actions.js';
import { BotMain } from '../src/client/bot-main.js';
import { createChannelSidebarRegistry } from '../src/client/channel-sidebar.js';
import { store, type BotSummary, type ChannelSummary } from '../src/client/store.js';

const AT = '2026-10-09T00:00:00Z';
let container: HTMLDivElement;
let root: Root;

const bot = (slug: string, name: string, aggregateState = 'idle'): BotSummary => ({
  slug,
  displayName: name,
  roles: [],
  aggregateState,
  workspaces: [],
  createdAt: AT,
});
const group: ChannelSummary = {
  id: 'group-crew',
  type: 'group',
  name: 'Launch crew',
  members: ['mira', 'nova', 'kai'],
  createdAt: AT,
  updatedAt: AT,
};

beforeEach(() => {
  Object.assign(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class {
      observe(): void {}
      disconnect(): void {}
    },
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('Channel Notices in a Group', () => {
  it('renders a Bot DM notice as a muted line that opens the sent message', async () => {
    const openChannel = vi.fn(async () => undefined);
    const openAround = vi.fn(async () => undefined);
    const noticeActions = new Proxy(
      { openChannel, openAround },
      {
        get: (target, key: string) => Reflect.get(target, key) ?? vi.fn(async () => undefined),
      },
    ) as unknown as BridgeActions;
    await act(async () => {
      store.setRoster([bot('mira', 'Mira'), bot('nova', 'Nova')], [group]);
      store.select({ kind: 'channel', channelId: group.id });
      store.setConversation({
        status: 'ready',
        channel: group,
        messages: [
          { id: 'm-1', at: AT, author: { kind: 'human' }, body: '@Mira ask Nova' },
          {
            id: 'bot-dm-action-x',
            at: AT,
            author: { kind: 'bot', slug: 'mira' },
            body: '',
            botDmAction: {
              channelId: 'dm-bot-mira-nova',
              messageId: 'x',
              recipientBotSlug: 'nova',
            },
          },
        ],
        drafts: [],
        error: undefined,
        sending: false,
      });
      store.setSessions({ status: 'ready', items: [], error: undefined });
      root.render(
        createElement(BotMain, {
          actions: noticeActions,
          channelSidebar: createChannelSidebarRegistry(),
        }),
      );
    });
    const notice = container.querySelector<HTMLButtonElement>('.bh-bot-dm-action');
    expect(notice?.textContent).toBe('Mira 向 Nova 发送了私聊消息');
    expect(notice?.dataset['messageId']).toBe('bot-dm-action-x');
    await act(async () => notice?.click());
    expect(openChannel).toHaveBeenCalledWith('dm-bot-mira-nova');
    expect(openAround).toHaveBeenCalledWith('dm-bot-mira-nova', 'x');
  });
});
