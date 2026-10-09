// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { WindowCompanion } from '../src/client/window-companion.js';
import { WindowCompanionView } from '../src/client/window-companion-view.js';
import { zhTranslate } from '../src/client/locale.js';

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
  IconEllipsisOutlineRegular: () => null,
  IconCloseFillRegular: () => null,
  IconNewChatOutlineRegular: () => null,
}));

it('keeps the Avatar tether aligned through resize and the first reduced-motion release commit', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  let stage = new DOMRect(80, 40, 800, 600);
  const measurement = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      if (!this.classList.contains('bh-persona-avatar')) return stage;
      const surface = this.closest<HTMLElement>('.bh-companion')!;
      return new DOMRect(
        stage.left + Number.parseFloat(surface.style.left),
        stage.bottom - Number.parseFloat(surface.style.bottom) - 96,
        96,
        96,
      );
    });
  const events = new EventTarget();
  const companion = new WindowCompanion({
    context: async () => ({ profileId: 'qa' }),
    source: () => ({ addEventListener: events.addEventListener.bind(events), close() {} }),
  });
  await companion.start();
  companion.select('ada');
  companion.configure({ walking: false });
  events.dispatchEvent(
    new MessageEvent('companion/baseline', {
      data: JSON.stringify({
        profileId: 'qa',
        bot: { slug: 'ada', name: 'Ada', paused: false, avatar: '/image' },
        activity: { generation: 'host', revision: 0, bots: [] },
      }),
    }),
  );
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const frame = () => {
    const due = [...frames.values()];
    frames.clear();
    for (const callback of due) callback(performance.now() + 50);
  };
  try {
    await act(() =>
      root.render(
        createElement(WindowCompanionView, {
          companion,
          openDm() {},
          openAttention() {},
          openChannel() {},
          t: zhTranslate,
        }),
      ),
    );
    await act(frame);
    expect(node.querySelector('.bh-companion-tether path')?.getAttribute('d')).toMatch(
      /^M 570 504 /u,
    );
    expect(node.querySelector<HTMLElement>('.bh-companion-activity')?.style.bottom).toBe('134px');
    stage = new DOMRect(100, 60, 650, 500);
    await act(() => window.dispatchEvent(new Event('resize')));
    await act(frame);
    expect(node.querySelector('.bh-companion-tether path')?.getAttribute('d')).toMatch(
      /^M 570 404 /u,
    );
    stage = new DOMRect(100, 60, 320, 500);
    await act(() => window.dispatchEvent(new Event('resize')));
    expect(node.querySelector<HTMLElement>('.bh-companion')?.style.left).toBe('216px');
    expect(node.querySelector('.bh-companion-tether path')?.getAttribute('d')).toMatch(
      /^M 264 404 /u,
    );
    await act(() => {
      document.documentElement.dataset['botharnessMotion'] = 'reduce';
    });
    const character = node.querySelector<HTMLButtonElement>('.bh-companion-character')!;
    character.setPointerCapture = vi.fn();
    character.releasePointerCapture = vi.fn();
    const pointer = (type: string, x: number, y: number) => {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      character.dispatchEvent(event);
    };
    await act(() => pointer('pointerdown', 264, 450));
    await act(() => pointer('pointermove', 164, 150));
    await act(frame);
    expect(node.querySelector<HTMLElement>('.bh-companion')?.style.bottom).toBe('300px');
    expect(node.querySelector('.bh-companion-tether path')?.getAttribute('d')).toMatch(
      /^M 164 104 /u,
    );
    await act(() => pointer('pointerup', 164, 150));
    expect(node.querySelector<HTMLElement>('.bh-companion')?.style.bottom).toBe('0px');
    expect(node.querySelector('.bh-companion-tether path')?.getAttribute('d')).toMatch(
      /^M 164 404 /u,
    );
    const visibility = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    await act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(frames.size).toBe(0);
    visibility.mockRestore();
  } finally {
    await act(() => root.unmount());
    companion.dispose();
    node.remove();
    measurement.mockRestore();
    vi.unstubAllGlobals();
    delete document.documentElement.dataset['botharnessMotion'];
  }
});

it('enables Group playback from the native menu and explains why a Bot-only source cannot open', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const paths: string[] = [];
  const events = new EventTarget();
  const companion = new WindowCompanion({
    context: async () => ({ profileId: 'qa' }),
    source: (path) => {
      paths.push(path);
      return { addEventListener: events.addEventListener.bind(events), close() {} };
    },
  });
  const baseline = () =>
    events.dispatchEvent(
      new MessageEvent('companion/baseline', {
        data: JSON.stringify({
          profileId: 'qa',
          bot: { slug: 'ada', name: 'Ada', paused: false },
          activity: { generation: 'host', revision: 0, bots: [{ slug: 'ada', state: 'thinking' }] },
        }),
      }),
    );
  await companion.start();
  companion.select('ada');
  baseline();
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const openChannel = vi.fn();
  try {
    await act(() =>
      root.render(
        createElement(WindowCompanionView, {
          companion,
          openDm() {},
          openAttention() {},
          openChannel,
          t: zhTranslate,
        }),
      ),
    );
    const menu = async (label: string) => {
      await act(() =>
        node
          .querySelector('.bh-companion')!
          .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
      );
      const button = [...node.querySelectorAll<HTMLButtonElement>('button')].find(
        (item) => item.textContent === label,
      )!;
      expect(button.disabled).toBe(false);
      await act(() => button.click());
      await act(() => baseline());
      await act(() => vi.advanceTimersByTime(800));
    };
    await menu('播放群聊消息');
    expect(new URL(paths.at(-1)!, 'http://localhost').searchParams.get('group')).toBe('1');
    await act(() =>
      events.dispatchEvent(
        new MessageEvent('companion/message', {
          data: JSON.stringify({
            generation: 'host',
            botId: 'ada',
            messageId: 'group',
            channelId: 'design',
            channelName: 'Design room',
            body: 'Group reply',
            source: 'shared-group',
            canOpen: true,
          }),
        }),
      ),
    );
    await act(() => companion.advance(1000));
    const shared = [...node.querySelectorAll<HTMLButtonElement>('button')].find(
      (item) => item.textContent === '群聊 · Design room',
    )!;
    await act(() => shared.click());
    expect(openChannel).toHaveBeenCalledExactlyOnceWith('design', 'group');
    await menu('Bot 加入的所有会话');
    expect(new URL(paths.at(-1)!, 'http://localhost').searchParams.get('visibility')).toBe(
      'all-bot',
    );
    await act(() =>
      events.dispatchEvent(
        new MessageEvent('companion/message', {
          data: JSON.stringify({
            generation: 'host',
            botId: 'ada',
            messageId: 'bots',
            channelId: 'bot-dm',
            channelName: 'Ada and Grace',
            body: 'Bot reply',
            source: 'bot-dm',
            participants: ['Ada', 'Grace'],
            canOpen: true,
          }),
        }),
      ),
    );
    await act(() => companion.advance(1000));
    const botDmSource = [...node.querySelectorAll<HTMLButtonElement>('button')].find(
      (item) => item.textContent === '私聊 · Ada and Grace',
    )!;
    expect(botDmSource.disabled).toBe(false);
    expect(node.textContent).toContain('Ada ↔ Grace');
    openChannel.mockRejectedValueOnce(new Error('Permission changed'));
    await act(async () => botDmSource.click());
    expect(openChannel).toHaveBeenLastCalledWith('bot-dm', 'bots');
    expect(node.textContent).toContain('当前无法读取原会话，仍可查看消息来源。');
    await act(() =>
      events.dispatchEvent(
        new MessageEvent('companion/message', {
          data: JSON.stringify({
            generation: 'host',
            botId: 'ada',
            messageId: 'private-group',
            channelId: 'private-group',
            channelName: 'Bot workroom',
            body: 'Bot-only Group reply',
            source: 'bot-group',
            canOpen: false,
          }),
        }),
      ),
    );
    await act(() => companion.advance(1000));
    const privateSource = [...node.querySelectorAll<HTMLButtonElement>('button')].find(
      (item) => item.textContent === '群聊 · Bot workroom',
    )!;
    expect(privateSource.disabled).toBe(true);
    expect(node.textContent).toContain('当前无法读取原会话，仍可查看消息来源。');
    await act(() => privateSource.click());
    expect(openChannel).toHaveBeenCalledTimes(2);
    await menu('播放私聊消息');
    expect(companion.getSnapshot().cards.map((card) => card.messageId)).toEqual([
      'group',
      'private-group',
    ]);
    expect(companion.getSnapshot().activity?.state).toBe('thinking');
    const character = node.querySelector<HTMLButtonElement>('.bh-companion-character')!;
    await act(() => character.focus());
    const dismiss = node.querySelector<HTMLButtonElement>('.bh-companion-card header > button')!;
    await act(() => dismiss.focus());
    await act(() => dismiss.click());
    expect(document.activeElement?.getAttribute('aria-label')).toBe('关闭气泡');
    expect(companion.getSnapshot().reading).toBe(true);
    await act(() =>
      events.dispatchEvent(
        new MessageEvent('companion/activity', {
          data: JSON.stringify({
            profileId: 'qa',
            bot: {
              slug: 'ada',
              name: 'Ada',
              paused: true,
              avatar: '/snapshot?v=unknown',
              appearance: {
                revision: 'a'.repeat(64),
                recipe: {
                  family: 'illustrated',
                  schemaVersion: 999,
                  assetVersion: 999,
                  rigVersion: 999,
                },
              },
            },
            activity: {
              generation: 'host',
              revision: 2,
              bots: [{ slug: 'ada', state: 'working' }],
            },
          }),
        }),
      ),
    );
    await act(() => companion.configure({ activity: false }));
    expect(node.textContent).toContain('已归档');
    expect(node.textContent).toContain('此版本无法播放形象动作，使用保存的快照');
    expect(node.querySelector('img')?.getAttribute('src')).toBe('/snapshot?v=unknown');
    expect(node.querySelector('[data-static="true"]')).not.toBeNull();
    expect(node.querySelector('[data-state="working"]')).toBeNull();
  } finally {
    await act(() => root.unmount());
    companion.dispose();
    node.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});

it('drags inside the shell, lands on the floor without opening DM, persists keyboard movement and releases frames', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  let intersect: ((entries: { isIntersecting: boolean }[]) => void) | undefined;
  const disconnected = vi.fn();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private readonly callback: (entries: { isIntersecting: boolean }[]) => void) {}
      observe(target: Element) {
        if (target.classList.contains('bh-companion')) intersect = this.callback;
      }
      disconnect = disconnected;
    },
  );
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
  const close = vi.fn();
  const owner = new WindowCompanion({
    context: async () => ({ profileId: 'qa' }),
    source: () => ({ addEventListener: events.addEventListener.bind(events), close }),
  });
  await owner.start();
  owner.select('ada');
  events.dispatchEvent(
    new MessageEvent('companion/baseline', {
      data: JSON.stringify({
        profileId: 'qa',
        bot: { slug: 'ada', name: 'Ada', paused: false },
        activity: { generation: 'host', revision: 0, bots: [{ slug: 'ada', state: 'idle' }] },
      }),
    }),
  );
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const openDm = vi.fn();
  try {
    await act(() =>
      root.render(
        createElement(WindowCompanionView, {
          companion: owner,
          openDm,
          openAttention() {},
          openChannel() {},
          t: zhTranslate,
        }),
      ),
    );
    const character = node.querySelector('.bh-companion-character');
    const surface = node.querySelector('.bh-companion');
    if (!(character instanceof HTMLButtonElement) || !(surface instanceof HTMLElement))
      throw new Error('Missing companion controls');
    await act(() => character.focus());
    expect(owner.getSnapshot().reading).toBe(true);
    await act(() =>
      character.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }),
      ),
    );
    expect(node.querySelector('[aria-expanded="true"]')).not.toBeNull();
    await act(() =>
      character.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    expect(node.querySelector('[aria-expanded="true"]')).toBeNull();
    expect(document.activeElement).toBe(character);
    await act(() => intersect!([{ isIntersecting: false }]));
    expect(frames.size).toBe(0);
    await act(() => intersect!([{ isIntersecting: true }]));
    expect(frames.size).toBe(1);
    const visibility = vi.spyOn(document, 'hidden', 'get');
    visibility.mockReturnValue(true);
    await act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(frames.size).toBe(0);
    visibility.mockReturnValue(false);
    await act(() => {
      vi.advanceTimersByTime(30_000);
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(frames.size).toBe(1);
    visibility.mockRestore();
    character.setPointerCapture = vi.fn();
    character.releasePointerCapture = vi.fn();
    const pointer = (type: string, x: number, y: number, id = 1) => {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
      Object.defineProperty(event, 'pointerId', { value: id });
      character.dispatchEvent(event);
    };
    await act(() => pointer('pointerdown', 700, 750));
    await act(() => pointer('pointermove', 400, 400));
    expect(character.style.transform).toMatch(/^rotate\(-[\d.]+deg\)/u);
    await act(() => pointer('pointermove', 450, 400));
    expect(character.style.transform).toMatch(/^rotate\([\d.]+deg\)/u);
    await act(() => pointer('pointermove', 400, 400));
    const lifted = Number.parseFloat(surface.style.bottom);
    expect(lifted).toBeGreaterThan(12);
    const draggedLeft = surface.style.left;
    await act(() => window.dispatchEvent(new Event('resize')));
    expect(Number.parseFloat(surface.style.bottom)).toBe(lifted);
    await act(() => pointer('pointermove', 400, 400));
    expect(surface.style.left).toBe(draggedLeft);
    await act(() => {
      pointer('pointerdown', 400, 400, 2);
      pointer('pointermove', 800, 100, 2);
      pointer('pointercancel', 800, 100, 2);
      pointer('lostpointercapture', 800, 100, 2);
    });
    expect(surface.style.left).toBe(draggedLeft);
    expect(surface.dataset['motion']).toBe('drag');
    await act(() => {
      pointer('pointerup', 400, 400);
      character.click();
    });
    expect(Number.parseFloat(surface.style.bottom)).toBe(lifted);
    await act(() => window.dispatchEvent(new Event('resize')));
    expect(Number.parseFloat(surface.style.bottom)).toBe(lifted);
    expect(surface.dataset['motion']).toBe('fall');
    await act(() => {
      document.documentElement.dataset['botharnessMotion'] = 'reduce';
    });
    expect(surface.style.bottom).toBe('0px');
    expect(character.style.transform).toBe('rotate(0deg) scale(1, 1)');
    await act(() => {
      delete document.documentElement.dataset['botharnessMotion'];
    });
    await act(() => {
      pointer('pointerdown', 400, 750);
      pointer('pointermove', 400, 750 - lifted);
      pointer('pointerup', 400, 750 - lifted);
    });

    expect(openDm).not.toHaveBeenCalled();
    const positions: number[] = [];
    await act(() => owner.reading(true));
    for (let index = 0; index < 240; index += 1) {
      await act(() => {
        vi.advanceTimersByTime(16);
        const callbacks = [...frames.values()];
        frames.clear();
        for (const callback of callbacks) callback(performance.now());
      });
      positions.push(Number.parseFloat(surface.style.bottom));
    }
    expect(positions.some((bottom) => bottom > 0 && bottom < lifted)).toBe(true);
    expect(positions.every((bottom) => bottom >= 0 && bottom <= window.innerHeight - 120)).toBe(
      true,
    );
    const firstContact = positions.findIndex((bottom) => bottom === 0);
    expect(firstContact).toBeGreaterThan(0);
    expect(positions.slice(firstContact + 1).some((bottom) => bottom > 0)).toBe(true);
    expect(surface.style.bottom).toBe('0px');
    expect(openDm).not.toHaveBeenCalled();
    await act(() =>
      character.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })),
    );
    expect(owner.getSnapshot().selection?.position).toBeCloseTo(
      Number.parseFloat(surface.style.left) / 896,
    );
    document.documentElement.dataset['botharnessMotion'] = 'reduce';
    await act(() => {
      pointer('pointerdown', 400, 750);
      pointer('pointermove', 700, 200);
    });
    expect(character.style.transform).toBe('rotate(0deg) scale(1, 1)');
    await act(() => pointer('pointerup', 700, 200));
    expect(surface.style.bottom).toBe('0px');
    await act(() => vi.runOnlyPendingTimers());
    delete document.documentElement.dataset['botharnessMotion'];
    await act(() => character.click());
    expect(openDm).toHaveBeenCalledExactlyOnceWith('ada');
    await act(() => {
      owner.configure({ activity: false });
      events.dispatchEvent(new Event('error'));
    });
    expect(surface.textContent).toContain('同步中断');
    expect(frames.size).toBeGreaterThan(0);
    await act(() => root.unmount());
    expect(frames.size).toBe(0);
    expect(disconnected).toHaveBeenCalled();
  } finally {
    await act(() => root.unmount());
    owner.dispose();
    expect(close).toHaveBeenCalledOnce();
    node.remove();
    measurement.mockRestore();
    vi.unstubAllGlobals();
    delete document.documentElement.dataset['botharnessMotion'];
    vi.useRealTimers();
  }
});

it('avoids overlapping archived and static-image labels even when Activity playback is disabled', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const { CompanionBubbles } = await import('../src/client/companion-bubbles.js');
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const measurement = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 400,
    bottom: 768,
    width: 400,
    height: 768,
    toJSON: () => ({}),
  });
  const owners: WindowCompanion[] = [];
  const node = document.createElement('div');
  const root = createRoot(node);
  try {
    for (const slug of ['ada', 'grace']) {
      const events = new EventTarget();
      const owner = new WindowCompanion({
        context: async () => ({ profileId: 'qa' }),
        source: () => ({
          addEventListener: events.addEventListener.bind(events),
          close() {},
        }),
      });
      owners.push(owner);
      await owner.start();
      owner.select(slug);
      owner.configure({ activity: false, walking: false });
      events.dispatchEvent(
        new MessageEvent('companion/baseline', {
          data: JSON.stringify({
            profileId: 'qa',
            bot: {
              slug,
              name: slug,
              paused: slug === 'ada',
              ...(slug === 'grace' ? { avatar: '/image' } : {}),
            },
            activity: { generation: 'host', revision: 1, bots: [] },
          }),
        }),
      );
    }
    const bubbles = new CompanionBubbles();
    await act(() =>
      root.render(
        createElement(
          'div',
          {},
          ...owners.map((owner, index) =>
            createElement(WindowCompanionView, {
              key: index,
              companion: owner,
              bubbles,
              openDm() {},
              openAttention() {},
              openChannel() {},
              t: zhTranslate,
            }),
          ),
        ),
      ),
    );
    await act(() => {
      const due = [...frames.values()];
      frames.clear();
      for (const callback of due) callback(performance.now() + 50);
    });
    const labels = [...node.querySelectorAll<HTMLElement>('.bh-companion-activity')];
    expect(labels).toHaveLength(2);
    expect(labels[0]!.textContent).toContain('已归档');
    expect(labels[1]!.textContent).toContain('静态图片');
    expect(labels[0]!.style.bottom).not.toBe(labels[1]!.style.bottom);
    expect(
      labels.every(
        (label) =>
          Number.parseFloat(label.style.bottom) >= 8 &&
          Number.parseFloat(label.style.bottom) <= 728,
      ),
    ).toBe(true);
  } finally {
    await act(() => root.unmount());
    owners.forEach((owner) => owner.dispose());
    expect(frames.size).toBe(0);
    measurement.mockRestore();
    vi.unstubAllGlobals();
  }
});
