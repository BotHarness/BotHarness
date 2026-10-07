import { useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import {
  Menu,
  IconEllipsisOutlineRegular,
  IconCloseFillRegular,
  IconNewChatOutlineRegular,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { PersonaBotAvatar, personaBotPresentationSummary } from './avatar.js';
import { attentionCount } from './activity-attention.js';
import { useMountedResource } from './mounted-resource.js';
import type { BotHarnessTranslate } from './locale.js';
import type { WindowCompanion } from './window-companion.js';
import { CompanionMotion } from './companion-motion.js';

export interface WindowCompanionViewProps {
  companion: WindowCompanion;
  openDm(botId: string): void;
  openAttention(): void;
  openChannel(channelId: string): void;
  t: BotHarnessTranslate;
}
export function WindowCompanionView({
  companion,
  openDm,
  openAttention,
  openChannel,
  t,
}: WindowCompanionViewProps): ReactElement | null {
  const view = useSyncExternalStore(companion.subscribe, companion.getSnapshot);
  const latest = useRef(view);
  latest.current = view;
  const [motion] = useState(() => new CompanionMotion());
  const [point, setPoint] = useState(motion.point);
  const root = useRef<HTMLDivElement | null>(null);
  const pointer = useRef<
    | {
        id: number;
        x: number;
        y: number;
        lastX: number;
        lastY: number;
        originX: number;
        originY: number;
        moved: boolean;
      }
    | undefined
  >(undefined);
  const direction = useRef(1);
  const hovering = useRef(false);
  const exit = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clickReset = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [menu, setMenu] = useState(false);
  const menuOpen = useRef(false);
  menuOpen.current = menu;
  const reducedMotion = (): boolean =>
    document.documentElement.dataset['botharnessMotion'] === 'reduce';
  const persistPosition = (): void => companion.configure({ position: motion.position() });
  const cancelDrag = (event: { pointerId: number }): void => {
    if (!pointer.current || pointer.current.id !== event.pointerId || motion.point.phase !== 'drag')
      return;
    pointer.current = undefined;
    setPoint(motion.release(performance.now(), reducedMotion(), true));
    persistPosition();
  };
  const leave = (): void => {
    hovering.current = false;
    if (exit.current !== undefined) clearTimeout(exit.current);
    exit.current = setTimeout(() => {
      exit.current = undefined;
      if (root.current?.contains(document.activeElement) || hovering.current || menuOpen.current)
        return;
      companion.reading(false);
    }, 800);
  };
  const enter = (): void => {
    hovering.current = true;
    if (exit.current !== undefined) clearTimeout(exit.current);
    companion.reading(true);
  };
  const mount = useMountedResource<HTMLDivElement>(
    (node) => {
      root.current = node;
      let frame = 0;
      let previous = performance.now();
      let elapsed = 0;
      let measured = false;
      const measure = () => {
        const width = node.getBoundingClientRect().width;
        const next = measured
          ? motion.resize(width, window.innerHeight)
          : motion.measure(width, window.innerHeight, latest.current.selection?.position ?? 0.75);
        measured = true;
        const drag = pointer.current;
        if (drag) {
          drag.x = drag.lastX;
          drag.y = drag.lastY;
          drag.originX = next.x;
          drag.originY = next.y;
        }
        setPoint(next);
      };
      const tick = (now: number) => {
        const milliseconds = Math.min(100, Math.max(0, now - previous));
        previous = now;
        const reduced = reducedMotion();
        const state = latest.current;
        if (!document.hidden) {
          elapsed += milliseconds;
          if (elapsed >= 50) {
            companion.advance(elapsed, reduced);
            elapsed = 0;
          }
          const walking = Boolean(
            state.selection?.walking &&
            state.bot?.paused !== true &&
            state.sync === 'live' &&
            !state.reading &&
            motion.point.phase === 'rest' &&
            !pointer.current &&
            !reduced,
          );
          const previousPoint = motion.point;
          const next = motion.advance(milliseconds, reduced, walking, direction.current);
          if (walking && (next.x <= 8 || next.x >= Math.max(8, next.width - 104)))
            direction.current *= -1;
          if (next !== previousPoint) setPoint(next);
          if (previousPoint.phase !== 'rest' && next.phase === 'rest') persistPosition();
        }
        frame = requestAnimationFrame(tick);
      };
      measure();
      frame = requestAnimationFrame(tick);
      window.addEventListener('resize', measure);
      return () => {
        cancelAnimationFrame(frame);
        window.removeEventListener('resize', measure);
        if (exit.current !== undefined) clearTimeout(exit.current);
        if (clickReset.current !== undefined) clearTimeout(clickReset.current);
        pointer.current = undefined;
        root.current = null;
      };
    },
    [companion, view.selection?.botId],
  );
  if (!view.selection || !view.bot) return null;
  const { selection, bot, activity } = view;
  const state = activity?.state ?? 'idle';
  const attention = activity?.attention;
  const items: MenuEntry[] = [
    {
      id: 'activity',
      label: t('companion.activity'),
      icon: <span aria-hidden="true">{selection.activity ? '✓' : ''}</span>,
    },
    {
      id: 'dm',
      label: t('companion.dm'),
      icon: <span aria-hidden="true">{selection.dm ? '✓' : ''}</span>,
    },
    { type: 'separator', id: 'remove-separator' },
    { id: 'remove', label: t('companion.remove') },
  ];
  const cards = view.reading ? view.cards : view.cards.slice(-3);
  const bubbleLeft = Math.max(-point.x + 8, Math.min(-108, point.width - point.x - 328));
  return (
    <div ref={mount} className="bh-root bh-companion-stage">
      <section
        className="bh-companion"
        aria-label={t('companion.label', { name: bot.name })}
        data-reading={view.reading}
        data-sync={view.sync}
        data-motion={point.phase}
        style={{ left: point.x, bottom: 12 + point.y }}
        onPointerEnter={enter}
        onPointerLeave={leave}
        onFocusCapture={enter}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) leave();
        }}
      >
        {selection.activity || view.sync !== 'live' ? (
          <div className="bh-companion-activity" style={{ left: bubbleLeft }} role="status">
            {view.sync !== 'live'
              ? t('companion.stale')
              : bot.paused
                ? t('companion.archived')
                : personaBotPresentationSummary(state, activity?.activity, undefined, t)}
          </div>
        ) : null}
        {view.cards.length ? (
          <ol
            className="bh-companion-cards"
            aria-label={t('companion.messages')}
            style={{
              left: bubbleLeft,
              height: view.reading
                ? Math.min(cards.length * 112, Math.max(112, window.innerHeight - 240))
                : 112,
            }}
          >
            {cards.map((card, index) => {
              const layer = cards.length - index - 1;
              return (
                <li
                  key={card.messageId}
                  ref={(node) => {
                    if (node) node.inert = !view.reading && layer !== 0;
                  }}
                  className="bh-companion-card"
                  style={{
                    top: view.reading ? index * 112 : 0,
                    transform: view.reading
                      ? 'none'
                      : `translateY(${-layer * 8}px) scale(${1 - layer * 0.04})`,
                    zIndex: view.reading ? 1 : index + 1,
                  }}
                  aria-hidden={!view.reading && layer !== 0}
                >
                  <header>
                    <button type="button" onClick={() => openChannel(card.channelId)}>
                      {t('companion.source', { name: card.channelName })}
                    </button>
                    <button
                      type="button"
                      aria-label={t('companion.dismiss')}
                      onClick={() => companion.dismiss(card.messageId)}
                    >
                      <IconCloseFillRegular size={14} />
                    </button>
                  </header>
                  <p>{card.body.slice(0, card.shown)}</p>
                </li>
              );
            })}
          </ol>
        ) : null}
        <div className="bh-companion-toolbar" data-open={view.reading || menu}>
          <button
            type="button"
            aria-label={t('companion.openDm')}
            title={t('companion.openDm')}
            onClick={() => openDm(bot.slug)}
          >
            <IconNewChatOutlineRegular size={16} />
          </button>
          <button
            type="button"
            aria-label={t(selection.walking ? 'companion.pause' : 'companion.walk')}
            title={t(selection.walking ? 'companion.pause' : 'companion.walk')}
            aria-pressed={!selection.walking}
            onClick={() => companion.configure({ walking: !selection.walking })}
          >
            {selection.walking ? 'Ⅱ' : '▷'}
          </button>
          <Menu
            open={menu}
            onClose={() => {
              setMenu(false);
              leave();
            }}
            items={items}
            dense
            anchor={
              <button
                type="button"
                aria-label={t('companion.more')}
                aria-expanded={menu}
                onClick={() => setMenu(!menu)}
              >
                <IconEllipsisOutlineRegular size={16} />
              </button>
            }
            onSelect={(id) => {
              if (id === 'remove') companion.remove();
              if (id === 'activity') companion.configure({ activity: !selection.activity });
              if (id === 'dm') companion.configure({ dm: !selection.dm });
              setMenu(false);
              leave();
            }}
          />
          {view.pending ? <span role="status">+{view.pending}</span> : null}
        </div>
        {attentionCount(attention) > 0 || attention?.informationalCount ? (
          <button
            type="button"
            className="bh-companion-attention"
            aria-label={t('companion.attention')}
            onClick={openAttention}
          >
            {attentionCount(attention) || 'i'}
          </button>
        ) : null}
        <button
          type="button"
          className="bh-companion-character"
          style={{
            transform: `rotate(${point.tilt}deg) scale(${1 + point.squash}, ${1 - point.squash})`,
          }}
          aria-label={t('companion.drag', { name: bot.name })}
          onClick={() => {
            if (!pointer.current?.moved) openDm(bot.slug);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault();
              setPoint(motion.move(motion.point.x + (event.key === 'ArrowLeft' ? -24 : 24)));
              persistPosition();
            }
          }}
          onPointerDown={(event) => {
            if (event.button !== 0 || pointer.current) return;
            if (clickReset.current !== undefined) clearTimeout(clickReset.current);
            event.currentTarget.setPointerCapture(event.pointerId);
            pointer.current = {
              id: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              lastX: event.clientX,
              lastY: event.clientY,
              originX: motion.point.x,
              originY: motion.point.y,
              moved: false,
            };
            setPoint(motion.grab(performance.now(), reducedMotion()));
          }}
          onPointerMove={(event) => {
            const drag = pointer.current;
            if (!drag || drag.id !== event.pointerId) return;
            const dx = event.clientX - drag.x;
            const dy = drag.y - event.clientY;
            drag.lastX = event.clientX;
            drag.lastY = event.clientY;
            drag.moved ||= Math.hypot(dx, dy) > 6;
            if (!drag.moved) return;
            setPoint(
              motion.drag(drag.originX + dx, drag.originY + dy, performance.now(), reducedMotion()),
            );
          }}
          onPointerUp={(event) => {
            const drag = pointer.current;
            if (!drag || drag.id !== event.pointerId) return;
            event.currentTarget.releasePointerCapture(event.pointerId);
            if (drag.moved) {
              setPoint(motion.release(performance.now(), reducedMotion()));
              persistPosition();
              event.preventDefault();
              clickReset.current = setTimeout(() => {
                clickReset.current = undefined;
                pointer.current = undefined;
              }, 0);
            } else {
              pointer.current = undefined;
              setPoint(motion.release(performance.now(), reducedMotion(), true));
            }
          }}
          onPointerCancel={cancelDrag}
          onLostPointerCapture={cancelDrag}
        >
          <PersonaBotAvatar
            personaBotId={bot.slug}
            name={bot.name}
            size={96}
            src={bot.avatar}
            appearance={bot.appearance}
            state={state}
            activity={activity?.activity}
            surface="companion"
            indicator={false}
            t={t}
          />
        </button>
      </section>
    </div>
  );
}
