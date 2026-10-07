import { useRef, useState, type ReactElement } from 'react';
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import { Combobox } from './combobox.js';
import { revealSidebarAnchor } from './sidebar-anchor.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';
import type { MessagingSnapshot } from '../../../core/src/messaging/outbound.js';
import type { BotHarnessTranslate } from './locale.js';
import { Modal } from './modal.js';
import { useMountedResource } from './mounted-resource.js';
import { highlightLarkSetup } from './lark-setup-tour.js';
import { larkSetupState, LARK_SETUP_STEPS, type LarkSetupStep } from './lark-setup-state.js';
import { openImSettings } from './bot-settings-open.js';

export function LarkSetupGuide({
  snapshot,
  t,
  refresh,
}: {
  snapshot: MessagingSnapshot | undefined;
  t: BotHarnessTranslate;
  refresh(): Promise<void>;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<'lark' | 'feishu'>('lark');
  const [accountKey, setAccountKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const stopTour = useRef<() => void>();
  const root = useRef<HTMLUListElement | null>(null);
  const alive = useRef(false);
  const refreshing = useRef(false);
  const refreshRef = useRef(refresh);
  const refreshState = async () => {
    await refresh();
  };
  refreshRef.current = refreshState;
  const progressMount = useMountedResource<HTMLDivElement>(() => {
    const timer = setInterval(() => {
      if (refreshing.current) return;
      refreshing.current = true;
      void refreshRef
        .current()
        .then(() => {
          if (alive.current) setFailed(false);
        })
        .catch(() => {
          if (alive.current) setFailed(true);
        })
        .finally(() => {
          refreshing.current = false;
        });
    }, 3000);
    return () => clearInterval(timer);
  }, []);
  const mount = useMountedResource<HTMLUListElement>((node) => {
    root.current = node;
    alive.current = true;
    return () => {
      alive.current = false;
      stopTour.current?.();
    };
  }, []);
  const state = larkSetupState(failed ? undefined : snapshot, accountKey);
  const check = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await refreshState();
    } catch {
      if (alive.current) setFailed(true);
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const locate = (step: LarkSetupStep) => {
    stopTour.current?.();
    setOpen(false);
    const doc = root.current?.ownerDocument;
    if (!doc) return;
    if (step === 'app') {
      const cancel = openImSettings(
        doc,
        (element) => {
          stopTour.current = highlightLarkSetup(
            element,
            t(`setup.step.${step}`),
            t(`setup.hint.${step}`),
            t('common.close'),
          );
        },
        () => {
          if (alive.current) setFailed(true);
        },
      );
      stopTour.current = cancel;
      return;
    }
    const fail = () => {
      if (alive.current) setFailed(true);
    };
    const anchor = step === 'bind' ? 'lark-bind' : 'lark-guide';
    let tour: (() => void) | undefined;
    const cancel = revealSidebarAnchor(
      doc,
      'external-identities',
      anchor,
      (element) => {
        tour = highlightLarkSetup(
          element,
          t(`setup.step.${step}`),
          t(`setup.hint.${step}`),
          t('common.close'),
        );
        stopTour.current = tour;
      },
      fail,
    );
    if (tour === undefined) stopTour.current = cancel;
  };
  return (
    <>
      <SidebarCardList listRef={mount} label={t('setup.title')}>
        <SidebarCardRow
          anchor="lark-guide"
          icon="compass"
          title={t('setup.title')}
          meta={failed && !open ? t('setup.failed') : t('setup.open')}
          state={failed && !open ? 'error' : undefined}
          dialog
          onClick={() => {
            stopTour.current?.();
            setOpen(true);
            void check();
          }}
        />
      </SidebarCardList>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('setup.title')}
        closeLabel={t('common.close')}
        className="bh-lark-setup-modal"
      >
        <div ref={progressMount} className="bh-lark-setup-body">
          <p>{t('setup.summary')}</p>
          <label className="bh-im-field">
            <span>{t('setup.platform')}</span>
            <Combobox
              searchable={false}
              label={t('setup.platform')}
              toggleLabel={t('setup.platform')}
              value={platform}
              onSelect={(value) => setPlatform(value === 'feishu' ? 'feishu' : 'lark')}
              options={[
                { value: 'lark', label: t('setup.lark') },
                { value: 'feishu', label: t('setup.feishu') },
              ]}
            />
          </label>
          <p>
            <a
              href={
                platform === 'lark'
                  ? 'https://open.larksuite.com/app'
                  : 'https://open.feishu.cn/app'
              }
              target="_blank"
              rel="noreferrer"
            >
              {t('setup.console')}
            </a>
            {' · '}
            <a href={t('setup.guideUrl')} target="_blank" rel="noreferrer">
              {t('setup.guide')}
            </a>
          </p>
          <details>
            <summary>{t('setup.prepare')}</summary>
            <ol>
              <li>{t('setup.application')}</li>
              <li>{t('setup.permissions')}</li>
              <li>{t('setup.events')}</li>
              <li>{t('setup.publish')}</li>
            </ol>
            <p>{t('setup.credentials')}</p>
            <img
              src="https://botharness.ai/guides/lark/14-message-event.webp"
              alt={t('setup.events')}
              loading="lazy"
            />
          </details>
          <label className="bh-im-field">
            <span>{t('im.account')}</span>
            <Combobox
              label={t('im.account')}
              toggleLabel={t('im.account')}
              placeholder={t('im.select')}
              emptyLabel={t('im.setup')}
              value={accountKey}
              onSelect={setAccountKey}
              options={(snapshot?.accounts ?? [])
                .filter((a) => a.platform === 'feishu')
                .map((a) => ({
                  value: `${a.providerId}:${a.ref}`,
                  label: a.name,
                  ...(a.connected ? {} : { hint: t('im.unavailable') }),
                }))}
            />
          </label>
          {busy || !snapshot ? (
            <p role="status">{t('setup.checking')}</p>
          ) : !failed && !state.providerReady ? (
            <p role="status">{t('setup.providerMissing')}</p>
          ) : null}
          <ol className="bh-lark-setup-steps">
            {LARK_SETUP_STEPS.map((step) => {
              const done =
                step === 'app'
                  ? !!state.account?.connected
                  : step === 'bind'
                    ? !!state.identity
                    : state.complete;
              return (
                <li key={step}>
                  <div>
                    <strong>{t(`setup.step.${step}`)}</strong>
                    <Tag tone="neutral">{t(done ? 'setup.done' : 'setup.pending')}</Tag>
                  </div>
                  <p>{t(`setup.hint.${step}`)}</p>
                  <Button size="sm" variant="primary" onClick={() => locate(step)}>
                    {t('setup.locate')}
                  </Button>
                </li>
              );
            })}
          </ol>
          <p>{t('setup.verifyHint')}</p>
          <pre>{t('setup.test')}</pre>
          {state.receipt ? (
            <p role="status">
              {t('setup.received')} · <code>{state.receipt.sourceEventId}</code>
              <br />
              {t(
                state.receipt.echoObserved
                  ? 'setup.echo'
                  : state.receipt.replyState === 'provider-accepted'
                    ? 'setup.accepted'
                    : 'setup.awaiting',
              )}
            </p>
          ) : null}
          <p>{t('setup.optional')}</p>
          {failed ? (
            <p role="alert" className="bh-error">
              {t('setup.failed')}
            </p>
          ) : null}
          <Button size="sm" variant="primary" disabled={busy} onClick={() => void check()}>
            {t(busy ? 'setup.checking' : 'setup.refresh')}
          </Button>
          <p>{t('setup.resume')}</p>
        </div>
      </Modal>
    </>
  );
}
