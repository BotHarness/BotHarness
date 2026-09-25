// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  return {
    Button: stub,
    IconAgentPresetOutline16: stub,
    IconAgentPresetOutlineRegular: stub,
    IconChevronDownOutline14: stub,
    IconChevronDownOutlineRegular: stub,
    IconCloseFill14: stub,
    IconCopyOutline16: stub,
    IconCopyOutlineRegular: stub,
    IconCloseOutline16: stub,
    IconEllipsisOutline16: stub,
    IconFolderOpenOutline16: stub,
    IconNewChatOutline16: stub,
    IconPanelLeftOutline16: stub,
    IconPanelLeftOutlineRegular: stub,
    IconPlusOutline16: stub,
    IconSearchOutline16: stub,
    IconSendOutline16: stub,
    IconSendOutlineRegular: stub,
    IconTrashOutline16: stub,
    Input: stub,
    Menu: stub,
    MarkdownText: stub,
    Modal: stub,
    StateDot: stub,
    Tag: stub,
    Tooltip: stub,
    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

import type { BridgeActions } from '../src/client/actions.js';
import { BotMain } from '../src/client/bot-main.js';
import { createChannelSidebarBuiltins } from '../src/client/channel-sidebar-builtins.js';
import { createChannelSidebarRegistry } from '../src/client/channel-sidebar.js';
import { channelSidebarPrefs } from '../src/client/channel-sidebar-prefs.js';
import { store } from '../src/client/store.js';
import type { MemoryGitGraph } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import { MemoryEntry } from '../src/client/memory-entry.js';

const SHA = 'a'.repeat(40);
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

describe('Memory Git graph sidebar', () => {
  it('shows a checked-out side branch and opens a commit even when accepted snapshot rejects it', async () => {
    const graph: MemoryGitGraph = {
      head: SHA,
      currentBranch: 'experiment',
      dirty: false,
      commits: [
        {
          sha: SHA,
          parents: [],
          subject: 'Explore old memory',
          authoredAt: '2026-09-25T00:00:00Z',
          branches: ['experiment'],
          status: 'pending',
        },
      ],
      hasMore: false,
    };
    const actions = {
      memorySnapshot: vi.fn().mockRejectedValue(new Error('Memory Repository must be on main')),
      memoryGitGraph: vi.fn().mockResolvedValue(graph),
    } as unknown as BridgeActions;
    const onSelect = vi.fn();

    await act(async () => {
      root.render(
        createElement(MemoryEntry, {
          scope: 'personabot',
          channelId: 'dm-qa',
          botSlug: 'qa',
          actions,
          onMemoryCommitSelect: onSelect,
          t: zhTranslate,
        }),
      );
    });

    expect(actions.memoryGitGraph).toHaveBeenCalledWith('dm-qa', 0);
    expect(container.textContent).toContain('experiment');
    expect(container.textContent).toContain('Explore old memory');
    expect(container.textContent).toContain('待验收');
    expect(container.textContent).toContain('Git 历史仍可查看');
    const row = container.querySelector<HTMLButtonElement>('.bh-memory-graph-row');
    expect(row).not.toBeNull();
    await act(async () => row?.click());
    expect(onSelect).toHaveBeenCalledWith(SHA);
  });
  it('loads the graph after the snapshot has seeded acceptance', async () => {
    let resolveSnapshot!: (value: { head: string; files: []; provisional: boolean }) => void;
    let seeded = false;
    const snapshot = new Promise<{ head: string; files: []; provisional: boolean }>((resolve) => {
      resolveSnapshot = resolve;
    });
    const actions = {
      memorySnapshot: vi.fn().mockReturnValue(snapshot),
      memoryGitGraph: vi.fn(async () => {
        expect(seeded).toBe(true);
        return {
          head: SHA,
          currentBranch: 'main',
          dirty: false,
          commits: [
            {
              sha: SHA,
              parents: [],
              subject: 'Seed commit',
              authoredAt: '2026-09-25T00:00:00Z',
              branches: ['main'],
              status: 'accepted',
            },
          ],
          hasMore: false,
        } satisfies MemoryGitGraph;
      }),
    } as unknown as BridgeActions;

    await act(async () => {
      root.render(
        createElement(MemoryEntry, {
          scope: 'personabot',
          channelId: 'dm-qa',
          botSlug: 'qa',
          actions,
          t: zhTranslate,
        }),
      );
    });
    expect(actions.memoryGitGraph).not.toHaveBeenCalled();

    await act(async () => {
      seeded = true;
      resolveSnapshot({ head: SHA, files: [], provisional: false });
    });
    expect(actions.memoryGitGraph).toHaveBeenCalledWith('dm-qa', 0);
    expect(container.textContent).toContain('Seed commit');
    expect(container.textContent).toContain('已验收');
  });

  it('shows a graph query failure instead of a permanent loading indicator', async () => {
    const actions = {
      memorySnapshot: vi.fn().mockResolvedValue({ head: SHA, files: [], provisional: false }),
      memoryGitGraph: vi.fn().mockRejectedValue(new Error('Unknown Memory Git commit')),
    } as unknown as BridgeActions;
    await act(async () => {
      root.render(
        createElement(MemoryEntry, {
          scope: 'personabot',
          channelId: 'dm-qa',
          botSlug: 'qa',
          actions,
          t: zhTranslate,
        }),
      );
    });
    expect(container.querySelector('.bh-memory-history [role="alert"]')?.textContent).toBe(
      'Unknown Memory Git commit',
    );
    expect(container.querySelector('.bh-memory-history .bh-note')).toBeNull();
  });

  it('replaces chat and composer with a diff, then restores the draft and original scroll after switching commits', async () => {
    const previous = store.getSnapshot();
    const otherSha = 'b'.repeat(40);
    const graph: MemoryGitGraph = {
      head: SHA,
      currentBranch: 'main',
      dirty: false,
      commits: [
        {
          sha: SHA,
          parents: [otherSha],
          subject: 'Current memory',
          authoredAt: '2026-09-25T00:00:00Z',
          branches: ['main'],
          status: 'accepted',
        },
        {
          sha: otherSha,
          parents: [],
          subject: 'Older memory',
          authoredAt: '2026-09-24T00:00:00Z',
          branches: [],
          status: 'accepted',
        },
      ],
      hasMore: false,
    };
    const channel = {
      id: 'dm-qa',
      type: 'dm' as const,
      name: 'QA',
      members: ['qa'],
      botSlug: 'qa',
      createdAt: '2026-09-25T00:00:00Z',
      updatedAt: '2026-09-25T00:00:00Z',
    };
    const actions = new Proxy(
      {
        memorySnapshot: vi.fn().mockResolvedValue({ head: SHA, files: [], provisional: false }),
        memoryGitGraph: vi.fn().mockResolvedValue(graph),
        memoryGitCommitDiff: vi.fn(async (_channelId: string, sha: string) => ({
          sha,
          files: [{ path: 'memory.md', status: 'M' }],
          diff: '+Memory at ' + sha.slice(0, 1),
        })),
      },
      {
        get(target, key: string) {
          return Reflect.get(target, key) ?? vi.fn(async () => undefined);
        },
      },
    ) as unknown as BridgeActions;
    const registry = createChannelSidebarRegistry();
    for (const entry of createChannelSidebarBuiltins(zhTranslate)) registry.register(entry);
    channelSidebarPrefs.setEntryExpanded('personabot:qa', 'memory', true);
    await act(async () => {
      store.setRoster(
        [
          {
            slug: 'qa',
            displayName: 'QA',
            roles: [],
            aggregateState: 'idle',
            workspaces: [],
            createdAt: '2026-09-25T00:00:00Z',
          },
        ],
        [channel],
      );
      store.select({ kind: 'bot', slug: 'qa' });
      store.setConversation({
        status: 'ready',
        channel,
        messages: [
          {
            id: 'm-1',
            at: '2026-09-25T00:00:00Z',
            author: { kind: 'human' },
            body: 'Earlier chat message',
          },
        ],
        error: undefined,
        sending: false,
      });
      store.setAssignments({ status: 'ready', items: [], selected: undefined, error: undefined });
      root.render(createElement(BotMain, { actions, channelSidebar: registry }));
    });

    const chat = container.querySelector<HTMLElement>('.bh-chat-body');
    const composer = container.querySelector<HTMLTextAreaElement>('textarea');
    expect(chat).not.toBeNull();
    expect(composer).not.toBeNull();
    chat!.scrollTop = 73;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(composer, 'Unsent QA draft');
      composer?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(composer?.value).toBe('Unsent QA draft');

    await act(async () => {
      container.querySelectorAll<HTMLButtonElement>('.bh-memory-graph-row')[0]?.click();
    });
    expect(container.querySelector('.bh-memory-commit-view')?.textContent).toContain('Memory at a');
    expect(chat?.style.display).toBe('none');
    expect(container.querySelector<HTMLElement>('.bh-memory-chat-composer')?.style.display).toBe(
      'none',
    );

    chat!.scrollTop = 0;
    await act(async () => {
      container.querySelectorAll<HTMLButtonElement>('.bh-memory-graph-row')[1]?.click();
    });
    expect(container.querySelector('.bh-memory-commit-view')?.textContent).toContain('Memory at b');
    await act(async () => {
      Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
        .find((button) => button.textContent?.trim() === '返回对话')
        ?.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(chat?.style.display).not.toBe('none');
    expect(container.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('Unsent QA draft');
    expect(chat?.scrollTop).toBe(73);

    await act(async () => {
      store.setRoster(previous.bots, previous.channels);
      store.select(previous.selection);
      store.setConversation(previous.conversation);
      store.setAssignments(previous.assignments);
      channelSidebarPrefs.setEntryExpanded('personabot:qa', 'memory', false);
    });
  });
});
