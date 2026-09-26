import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';

import { PersonaBotAvatar } from './avatar.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';
import type { BotSummary, ChannelMessage } from './store.js';

const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
type Delivery = NonNullable<ChannelMessage['deliveries']>[number];
type DeliveryState = Delivery['state'];

const STATE_ORDER: readonly DeliveryState[] = [
  'handled',
  'running',
  'pending',
  'ignored',
  'retryable',
  'needs-repair',
];

function stateLabel(state: DeliveryState, t: BotHarnessTranslate): string {
  return t(('message.delivery.' + state) as BotHarnessKey);
}

export function ChannelDeliveryReceipt({
  message,
  bots,
  t,
}: {
  message: ChannelMessage;
  bots: readonly BotSummary[];
  t: BotHarnessTranslate;
}): ReactElement | null {
  const authorSlug = message.author.kind === 'bot' ? message.author.slug : undefined;
  const deliveries = (message.deliveries ?? []).filter(
    (delivery) => delivery.botSlug !== authorSlug,
  );
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const signature = deliveries.map((delivery) => delivery.botSlug + ':' + delivery.state).join('|');
  const groups = STATE_ORDER.flatMap((state) => {
    const recipients = deliveries.filter((delivery) => delivery.state === state);
    return recipients.length === 0 ? [] : [{ state, recipients }];
  });
  const summary = groups
    .map(({ state, recipients }) => recipients.length + ' ' + stateLabel(state, t))
    .join(' · ');

  useClientLayoutEffect(() => {
    if (!open) return;
    const place = (): void => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const panel = panelRef.current;
      if (anchor === undefined || panel === null) return;
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      const left = Math.max(
        8,
        Math.min(anchor.left + anchor.width / 2 - width / 2, window.innerWidth - width - 8),
      );
      const below = anchor.bottom + 8;
      const top =
        below + height <= window.innerHeight - 8 ? below : Math.max(8, anchor.top - height - 8);
      setPosition((previous) =>
        previous?.left === left && previous.top === top ? previous : { left, top },
      );
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, signature]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const dismissOutside = (event: Event): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const dismissEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      anchorRef.current?.focus();
    };
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('focusin', dismissOutside);
    window.addEventListener('keydown', dismissEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('focusin', dismissOutside);
      window.removeEventListener('keydown', dismissEscape);
    };
  }, [open]);

  if (deliveries.length === 0 || message.pending === true || message.streaming === true)
    return null;

  let offset = 0;
  const sectors = groups.map(({ state, recipients }) => {
    const length = (recipients.length / deliveries.length) * 100;
    const sector = { state, length, offset };
    offset += length;
    return sector;
  });

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="bh-delivery-trigger"
        aria-label={t('message.delivery.label') + ': ' + summary}
        aria-controls={panelId}
        aria-expanded={open}
        title={summary}
        onClick={() => setOpen((current) => !current)}
      >
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
          <circle className="bh-delivery-track" cx="10" cy="10" r="7.5" />
          {sectors.map(({ state, length, offset: start }) => (
            <circle
              key={state}
              className={'bh-delivery-sector bh-delivery-sector-' + state}
              cx="10"
              cy="10"
              r="7.5"
              pathLength={100}
              strokeDasharray={length + ' ' + (100 - length)}
              strokeDashoffset={-start}
            />
          ))}
        </svg>
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              role="dialog"
              aria-label={t('message.delivery.label')}
              tabIndex={-1}
              className="bh-delivery-panel"
              style={{
                left: position?.left ?? 0,
                top: position?.top ?? 0,
                visibility: position === null ? 'hidden' : 'visible',
              }}
            >
              <div className="bh-delivery-panel-summary">{summary}</div>
              <div className="bh-delivery-panel-groups">
                {groups.map(({ state, recipients }) => (
                  <section key={state} className="bh-delivery-panel-group">
                    <h3>
                      <span className={'bh-delivery-legend bh-delivery-legend-' + state} />
                      {recipients.length} {stateLabel(state, t)}
                    </h3>
                    <ul>
                      {recipients.map((delivery) => {
                        const bot = bots.find((candidate) => candidate.slug === delivery.botSlug);
                        const name = bot?.displayName ?? delivery.botSlug;
                        return (
                          <li key={delivery.botSlug} title={name}>
                            <PersonaBotAvatar
                              personaBotId={delivery.botSlug}
                              name={name}
                              src={bot?.avatar}
                              size={22}
                              indicator={false}
                              t={t}
                            />
                            <span>{name}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
