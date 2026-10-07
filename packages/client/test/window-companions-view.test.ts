// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { WindowCompanions } from '../src/client/window-companions.js';
import { WindowCompanionsView, CompanionSettings } from '../src/client/window-companions-view.js';
import { zhTranslate } from '../src/client/locale.js';
import { GroupChannelHeader } from '../src/client/group-channel-header.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Menu: ({
    anchor,
    open,
    items,
    onSelect,
  }: {
    anchor: ReactNode;
    open: boolean;
    items: { id: string; label?: string; disabled?: boolean }[];
    onSelect(id: string): void;
  }) =>
    createElement(
      'div',
      {},
      anchor,
      open
        ? items
            .filter((item) => item.label)
            .map((item) =>
              createElement(
                'button',
                { key: item.id, disabled: item.disabled, onClick: () => onSelect(item.id) },
                item.label,
              ),
            )
        : null,
    ),
  Input: (props: Record<string, unknown>) => createElement('input', props),
  Button: ({
    children,
    size: _size,
    variant: _variant,
    ...props
  }: {
    children: ReactNode;
    size?: string;
    variant?: string;
  }) => createElement('button', props, children),
  IconEllipsisOutlineRegular: () => null,
  IconCloseFillRegular: () => null,
  IconNewChatOutlineRegular: () => null,
  IconPinFillRegular: () => null,
  IconPinOutlineRegular: () => null,
  Tooltip: ({ children }: { children: ReactNode }) => children,
}));

it('pins independently, exposes right-click controls and applies global bounded card capacity', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const frames = new Map<number, FrameRequestCallback>();
  let frame = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frame, callback);
    return frame;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const measurement = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 1000,
    bottom: 800,
    width: 1000,
    height: 800,
    toJSON: () => ({}),
  });
  const events = new EventTarget();
  const owner = new WindowCompanions({
    context: async () => ({ profileId: 'qa' }),
    source: () => ({ addEventListener: events.addEventListener.bind(events), close() {} }),
    update: async () => {},
  });
  await owner.start();
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  try {
    await act(() =>
      root.render(
        createElement(
          'div',
          {},
          createElement(GroupChannelHeader, {
            companion: owner,
            channel: {
              id: 'qa-group',
              type: 'group',
              name: 'QA',
              members: ['ada', 'grace'],
              createdAt: '2026-10-08T00:00:00Z',
              updatedAt: '2026-10-08T00:00:00Z',
            },
            title: 'QA',
            members: [
              { personaBotId: 'ada', name: 'Ada' },
              { personaBotId: 'grace', name: 'Grace' },
            ],
            expanded: false,
            onOpenActivity() {},
            onToggleProfile() {},
            t: zhTranslate,
          }),
          createElement(WindowCompanionsView, {
            companion: owner,
            openDm() {},
            openChannel() {},
            openAttention() {},
            t: zhTranslate,
          }),
          createElement(CompanionSettings, { companion: owner, t: zhTranslate }),
        ),
      ),
    );
    const pins = node.querySelectorAll<HTMLButtonElement>('.bh-companion-pin');
    expect(pins).toHaveLength(2);
    expect(pins[0]!.getAttribute('aria-label')).toContain('Ada');
    expect(pins[1]!.getAttribute('aria-label')).toContain('Grace');
    expect(node.querySelector('button button')).toBeNull();
    await act(() => {
      pins[0]!.click();
      pins[1]!.click();
    });
    await act(() => {
      events.dispatchEvent(
        new MessageEvent('companion/baseline', {
          data: JSON.stringify({
            profileId: 'qa',
            consumerId: 'one',
            bots: [],
            activity: { generation: 'host', revision: 0, bots: [] },
          }),
        }),
      );
      events.dispatchEvent(
        new MessageEvent('companion/selection', {
          data: JSON.stringify({
            profileId: 'qa',
            consumerId: 'one',
            bots: [
              { slug: 'ada', name: 'Ada', paused: false },
              { slug: 'grace', name: 'Grace', paused: false },
            ],
            activity: {
              generation: 'host',
              revision: 1,
              bots: [
                { slug: 'ada', state: 'idle' },
                { slug: 'grace', state: 'thinking' },
              ],
            },
          }),
        }),
      );
    });
    expect(node.querySelectorAll('.bh-companion-character')).toHaveLength(2);
    await act(() => {
      for (const callback of [...frames.values()]) callback(performance.now());
    });
    const bubbles = [...node.querySelectorAll<HTMLElement>('.bh-companion-activity')];
    expect(bubbles[0]!.style.bottom).not.toBe(bubbles[1]!.style.bottom);
    expect([...pins].map((pin) => pin.getAttribute('aria-pressed'))).toEqual(['true', 'true']);
    const grace = node.querySelector<HTMLElement>('[data-bot="grace"]')!;
    await act(() => {
      for (let i = 0; i < 3; i++)
        events.dispatchEvent(
          new MessageEvent('companion/message', {
            data: JSON.stringify({
              generation: 'host',
              botId: 'grace',
              messageId: `grace-${i}`,
              channelId: 'grace-dm',
              channelName: 'Grace',
              body: `Grace ${i}`,
            }),
          }),
        );
    });
    await act(() => grace.querySelector<HTMLButtonElement>('.bh-companion-character')!.focus());
    await act(() => {
      for (const callback of [...frames.values()]) callback(performance.now() + 30);
    });
    const readingAnchor = grace.querySelector<HTMLElement>('.bh-companion-activity')!.style.bottom;
    await act(() => {
      events.dispatchEvent(
        new MessageEvent('companion/message', {
          data: JSON.stringify({
            generation: 'host',
            botId: 'ada',
            messageId: 'one',
            channelId: 'ada-dm',
            channelName: 'Ada',
            body: 'Independent message',
          }),
        }),
      );
    });
    await act(() => {
      for (const callback of [...frames.values()]) callback(performance.now() + 60);
    });
    expect(owner.get('grace')!.getSnapshot().reading).toBe(true);
    expect(grace.querySelector<HTMLElement>('.bh-companion-activity')!.style.bottom).toBe(
      readingAnchor,
    );
    expect(grace.querySelectorAll('.bh-companion-card')).toHaveLength(3);
    expect(grace.textContent).not.toContain('Independent message');
    const bounds = (botId: string) => {
      const character = node.querySelector<HTMLElement>(`[data-bot="${botId}"]`)!;
      const cards = character.querySelector<HTMLElement>('.bh-companion-cards')!;
      const left = Number.parseFloat(character.style.left) + Number.parseFloat(cards.style.left);
      const bottom = Number.parseFloat(cards.style.bottom);
      return {
        left,
        right: left + 320,
        bottom,
        top: bottom + Number.parseFloat(cards.style.height),
      };
    };
    const graceBounds = bounds('grace');
    const adaBounds = bounds('ada');
    expect(
      adaBounds.right <= graceBounds.left ||
        adaBounds.left >= graceBounds.right ||
        adaBounds.top <= graceBounds.bottom ||
        adaBounds.bottom >= graceBounds.top,
    ).toBe(true);
    await act(() => {
      owner.get('grace')!.reading(false);
      for (const card of owner.get('grace')!.getSnapshot().cards)
        owner.get('grace')!.dismiss(card.messageId);
    });
    await act(() => owner.get('grace')!.configure({ activity: false }));
    for (let tick = 1; tick <= 2; tick++)
      await act(() => {
        for (const callback of [...frames.values()]) callback(performance.now() + tick * 60);
      });
    expect(
      node.querySelector<HTMLElement>('[data-bot="ada"] .bh-companion-cards')!.style.bottom,
    ).toBe('174px');
    const ada = node.querySelector<HTMLElement>('[data-bot="ada"]')!;
    await act(() =>
      ada.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
    );
    expect(ada.querySelector('[aria-expanded="true"]')).not.toBeNull();
    const walking = [...ada.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === '暂停走动',
    )!;
    await act(() => walking.click());
    expect(owner.get('ada')!.getSnapshot().selection?.walking).toBe(false);
    expect(owner.get('grace')!.getSnapshot().selection?.walking).toBe(true);
    const input = node.querySelector<HTMLInputElement>('[name="retention"]')!;
    await act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '2');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(() =>
      node
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    expect(owner.getSnapshot().capacity).toEqual({ layers: 2, retention: 2 });
    expect(owner.get('grace')!.getSnapshot().capacity.retention).toBe(2);
    await act(() => pins[0]!.click());
    expect(node.querySelector('[data-bot="ada"]')).toBeNull();
    expect(node.querySelector('[data-bot="grace"]')).not.toBeNull();
  } finally {
    await act(() => root.unmount());
    node.remove();
    owner.dispose();
    measurement.mockRestore();
    vi.unstubAllGlobals();
  }
});
