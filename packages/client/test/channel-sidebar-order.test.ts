// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronDownOutlineRegular: () => null,
  Tooltip: ({ children }: { children: ReactNode }) => children,
  Menu: ({ open, anchor, children }: { open: boolean; anchor: ReactNode; children: ReactNode }) =>
    createElement('div', null, anchor, open ? children : null),
  MenuItemButton: ({
    onSelect,
    children,
    disabled,
  }: {
    onSelect(): void;
    children: ReactNode;
    disabled?: boolean;
  }) => createElement('button', { onClick: onSelect, disabled }, children),
}));
import { ChannelSidebarContents } from '../src/client/channel-sidebar-view.js';
import {
  channelSidebarScopeKey,
  createChannelSidebarPrefs,
  type ChannelSidebarPrefs,
} from '../src/client/channel-sidebar-prefs.js';
import type {
  ChannelSidebarEntry,
  ChannelSidebarEntryProps,
  ChannelSidebarScope,
} from '../src/client/channel-sidebar.js';
import { zhTranslate } from '../src/client/locale.js';
let root: Root;
let host: HTMLDivElement;
let prefs: ChannelSidebarPrefs;
let storage: Map<string, string>;
const entry = (id: string, scope: ChannelSidebarScope = 'personabot'): ChannelSidebarEntry => ({
  id,
  label: id,
  scope,
  component: () => createElement('div', null, 'body-' + id),
});
let entries: ChannelSidebarEntry[];
let registered: ChannelSidebarEntry[];
function render(scope: ChannelSidebarScope = 'personabot', slug = 'ada') {
  const scopeKey = channelSidebarScopeKey(scope, 'dm-' + slug, slug);
  const props = {
    scope,
    channelId: 'dm-' + slug,
    botSlug: scope === 'personabot' ? slug : undefined,
    actions: {},
    t: zhTranslate,
  } as unknown as ChannelSidebarEntryProps;
  act(() =>
    root.render(
      createElement(ChannelSidebarContents, {
        key: scopeKey,
        entries,
        registered,
        entryProps: props,
        prefs,
        controller: {
          isEntryExpanded: (id) => prefs.isEntryExpanded(scopeKey, id),
          toggleEntry: (id) =>
            prefs.setEntryExpanded(scopeKey, id, !prefs.isEntryExpanded(scopeKey, id)),
        },
      }),
    ),
  );
}
const order = () =>
  [...host.querySelectorAll<HTMLElement>('[data-entry-id]')].map((n) => n.dataset['entryId']);
function click(label: string) {
  act(() => [...host.querySelectorAll('button')].find((b) => b.textContent === label)?.click());
}
function edit() {
  act(() => host.querySelector<HTMLButtonElement>('.bh-sidebar-settings')!.click());
  click('编辑侧边栏');
}
function key(id: string, value: string) {
  act(() =>
    host
      .querySelector<HTMLElement>('[data-order-handle="' + id + '"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true })),
  );
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => {
    callback(0);
    return 1;
  });
  storage = new Map();
  prefs = createChannelSidebarPrefs({
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, v),
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  entries = ['memory', 'sessions', 'inbox'].map((id) => entry(id));
  registered = entries;
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
describe('Channel sidebar personal order editor', () => {
  it('folds only the presentation and saves a keyboard draft shared by DMs after Done', () => {
    prefs.setEntryExpanded('personabot:ada', 'memory', true);
    render();
    expect(host.textContent).toContain('body-memory');
    edit();
    expect(host.textContent).not.toContain('body-memory');
    expect(prefs.isEntryExpanded('personabot:ada', 'memory')).toBe(true);
    key('memory', 'ArrowDown');
    expect(order()).toEqual(['sessions', 'memory', 'inbox']);
    expect(prefs.getSnapshot().entryOrders.personabot).toEqual([]);
    expect(host.querySelector('[role=status]')?.textContent).toContain('第 2 项');
    click('完成');
    expect(prefs.getSnapshot().entryOrders.personabot).toEqual(['sessions', 'memory', 'inbox']);
    expect(host.textContent).toContain('body-memory');
    render('personabot', 'bea');
    expect(order()).toEqual(['sessions', 'memory', 'inbox']);
    expect(host.textContent).not.toContain('body-memory');
    prefs = createChannelSidebarPrefs({
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, v),
    });
    render();
    expect(order()).toEqual(['sessions', 'memory', 'inbox']);
  });
  it('Cancel discards moves and a default reset while restoring the prior expansion', () => {
    prefs.setEntryOrder('personabot', ['inbox', 'memory', 'sessions']);
    prefs.setEntryExpanded('personabot:ada', 'memory', true);
    render();
    const saved = storage.get('botharness.channel-sidebar');
    edit();
    key('inbox', 'End');
    expect(order()).toEqual(['memory', 'sessions', 'inbox']);
    click('恢复默认顺序');
    expect(order()).toEqual(['memory', 'sessions', 'inbox']);
    click('取消');
    expect(order()).toEqual(['inbox', 'memory', 'sessions']);
    expect(storage.get('botharness.channel-sidebar')).toBe(saved);
    expect(host.textContent).toContain('body-memory');
  });
  it('commits default registrar order only on Done', () => {
    prefs.setEntryOrder('personabot', ['inbox', 'memory', 'sessions']);
    render();
    edit();
    click('恢复默认顺序');
    expect(prefs.getSnapshot().entryOrders.personabot[0]).toBe('inbox');
    click('完成');
    expect(prefs.getSnapshot().entryOrders.personabot).toEqual(['memory', 'sessions', 'inbox']);
  });
  it('uses the same move result for drag and keyboard without committing either draft', () => {
    render();
    edit();
    key('memory', 'End');
    const keyboard = order();
    click('取消');
    edit();
    const transfer = { effectAllowed: '', setData: vi.fn() };
    const start = new Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(start, 'dataTransfer', { value: transfer });
    act(() => host.querySelector('[data-order-handle="memory"]')!.dispatchEvent(start));
    act(() =>
      host
        .querySelector('[data-entry-id="inbox"]')!
        .dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true })),
    );
    act(() =>
      host
        .querySelector('[data-entry-id="inbox"]')!
        .dispatchEvent(new Event('drop', { bubbles: true, cancelable: true })),
    );
    expect(order()).toEqual(keyboard);
    expect(prefs.getSnapshot().entryOrders.personabot).toEqual([]);
    click('完成');
    expect(prefs.getSnapshot().entryOrders.personabot).toEqual(keyboard);
  });
  it('keeps group and DM orders independent across storage reload', () => {
    render();
    edit();
    key('memory', 'End');
    click('完成');
    entries = ['members', 'settings'].map((id) => entry(id, 'channel'));
    registered = entries;
    render('channel', 'team');
    expect(order()).toEqual(['members', 'settings']);
    edit();
    key('members', 'End');
    click('完成');
    prefs = createChannelSidebarPrefs({
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, v),
    });
    render('channel', 'another-team');
    expect(order()).toEqual(['settings', 'members']);
    entries = ['memory', 'sessions', 'inbox'].map((id) => entry(id));
    registered = entries;
    render();
    expect(order()).toEqual(['sessions', 'inbox', 'memory']);
  });
  it('retains unavailable identities and appends new registered entries deterministically', () => {
    prefs.setEntryOrder('personabot', ['inbox', 'memory', 'sessions']);
    render();
    edit();
    key('memory', 'Home');
    entries = [entry('memory'), entry('inbox'), entry('new')];
    registered = [entry('memory'), entry('sessions'), entry('inbox'), entry('new')];
    render();
    expect(order()).toEqual(['memory', 'inbox', 'new']);
    click('完成');
    entries = registered;
    render();
    expect(order()).toEqual(['memory', 'inbox', 'sessions', 'new']);
    entries = entries.filter((e) => e.id !== 'sessions');
    registered = entries;
    render();
    expect(order()).toEqual(['memory', 'inbox', 'new']);
    entries = [...entries, entry('sessions')];
    registered = entries;
    render();
    expect(order()).toEqual(['memory', 'inbox', 'sessions', 'new']);
  });
  it.each(['完成', '取消'])('does not resurrect revoked expansion on %s', (action) => {
    let report: ChannelSidebarEntryProps['setExpandable'];
    entries[0] = {
      ...entries[0]!,
      headerAction: (props) => {
        report = props.setExpandable;
        return createElement('span', null, 'permission');
      },
    };
    registered = entries;
    prefs.setEntryExpanded('personabot:ada', 'memory', true);
    render();
    edit();
    act(() => report?.(false));
    expect(prefs.isEntryExpanded('personabot:ada', 'memory')).toBe(false);
    click(action);
    expect(host.textContent).not.toContain('body-memory');
    expect(
      host.querySelector<HTMLButtonElement>(
        '[data-entry-id="memory"] .bh-channel-sidebar-entry-head',
      )?.disabled,
    ).toBe(true);
  });
  it('discards interrupted drafts without leaking into another selection or a later mount', () => {
    prefs.setEntryExpanded('personabot:ada', 'memory', true);
    render();
    edit();
    key('memory', 'End');
    render('personabot', 'bea');
    expect(order()).toEqual(['memory', 'sessions', 'inbox']);
    expect(host.querySelector('[data-order-handle]')).toBeNull();
    render();
    expect(host.textContent).toContain('body-memory');
    edit();
    key('memory', 'End');
    act(() => root.render(null));
    render();
    expect(order()).toEqual(['memory', 'sessions', 'inbox']);
    expect(host.querySelector('[data-order-handle]')).toBeNull();
    expect(prefs.getSnapshot().entryOrders.personabot).toEqual([]);
  });
  it('ignores foreign drops and preserves width, terminology and per-entity collapse preferences', () => {
    prefs.setWidth(420);
    prefs.setMemoryTerminology('git');
    prefs.setSidebarCollapsed('channel:team', true);
    render();
    edit();
    act(() =>
      host
        .querySelector('[data-entry-id="inbox"]')!
        .dispatchEvent(new Event('drop', { bubbles: true, cancelable: true })),
    );
    expect(order()).toEqual(['memory', 'sessions', 'inbox']);
    key('memory', 'ArrowDown');
    click('完成');
    expect(prefs.getSnapshot().width).toBe(420);
    expect(prefs.getSnapshot().memoryTerminology).toBe('git');
    expect(prefs.isSidebarCollapsed('channel:team')).toBe(true);
  });
});
