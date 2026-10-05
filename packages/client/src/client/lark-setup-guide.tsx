import { useRef, useState, type ReactElement } from 'react';
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MessagingSnapshot } from '../../../core/src/messaging/outbound.js';
import type { MessagingTarget } from '../../../core/src/messaging/provider.js';
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
  loadTargets,
}: {
  snapshot: MessagingSnapshot | undefined;
  t: BotHarnessTranslate;
  refresh(): Promise<void>;
  loadTargets(providerId: string, accountRef: string): Promise<MessagingTarget[]>;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<'lark' | 'feishu'>('lark');
  const [accountKey, setAccountKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [targetRows, setTargetRows] = useState<{
    accountKey: string;
    targets: MessagingTarget[];
  }>();
  const targetRequest = useRef(0);
  const stopTour = useRef<() => void>();
  const root = useRef<HTMLElement | null>(null);
  const alive = useRef(false);
  const refreshing = useRef(false);
  const refreshRef = useRef(refresh);
  const readTargets = async (key: string) => {
    const sequence = ++targetRequest.current;
    const account = snapshot?.accounts.find((a) => `${a.providerId}:${a.ref}` === key);
    if (!account?.connected || account.platform !== 'feishu') {
      setTargetRows(undefined);
      return;
    }
    try {
      const targets = await loadTargets(account.providerId, account.ref);
      if (alive.current && sequence === targetRequest.current)
        setTargetRows({ accountKey: key, targets });
    } catch (error) {
      if (alive.current && sequence === targetRequest.current) throw error;
    }
  };
  const refreshState = async () => {
    await refresh();
    await readTargets(accountKey);
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
  const mount = useMountedResource<HTMLElement>((node) => {
    root.current = node;
    alive.current = true;
    return () => {
      alive.current = false;
      ++targetRequest.current;
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
    if (step === 'account' || step === 'target') {
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
    const profile = root.current?.parentElement;
    const element =
      step === 'identity'
        ? profile?.querySelector('[data-bh-lark-bind]')
        : profile?.querySelector(
            step === 'grant' ? '[data-bh-lark-grant]' : '[data-bh-lark-guide]',
          );
    if (element) {
      if (step === 'grant') element.querySelector('details')?.setAttribute('open', '');
      stopTour.current = highlightLarkSetup(
        element,
        t(`setup.step.${step}`),
        t(`setup.hint.${step}`),
        t('common.close'),
      );
    } else setFailed(true);
  };
  return (
    <section
      ref={mount}
      className="bh-profile-section bh-lark-setup"
      aria-label={t('setup.title')}
      data-bh-lark-guide
    >
      <header className="bh-identity-header">
        <strong>{t('setup.title')}</strong>
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            stopTour.current?.();
            setOpen(true);
            void check();
          }}
        >
          {t('setup.open')}
        </Button>
      </header>
      {failed && !open ? (
        <p role="alert" className="bh-error">
          {t('setup.failed')}
        </p>
      ) : null}
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
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value === 'feishu' ? 'feishu' : 'lark')}
            >
              <option value="lark">{t('setup.lark')}</option>
              <option value="feishu">{t('setup.feishu')}</option>
            </select>
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
            <select
              value={accountKey}
              onChange={(e) => {
                const key = e.target.value;
                setAccountKey(key);
                setTargetRows(undefined);
                void readTargets(key).catch(() => {
                  if (alive.current) setFailed(true);
                });
              }}
            >
              <option value="">{t('im.select')}</option>
              {snapshot?.accounts
                .filter((a) => a.platform === 'feishu')
                .map((a) => (
                  <option key={`${a.providerId}:${a.ref}`} value={`${a.providerId}:${a.ref}`}>
                    {a.name}
                    {a.connected ? '' : ` · ${t('im.unavailable')}`}
                  </option>
                ))}
            </select>
          </label>
          {!state.providerReady ? <p role="status">{t('setup.providerMissing')}</p> : null}
          <ol className="bh-lark-setup-steps">
            {LARK_SETUP_STEPS.map((step) => {
              const done =
                step === 'account'
                  ? !!state.account?.connected
                  : step === 'identity'
                    ? !!state.identity
                    : step === 'grant'
                      ? !!state.grants.length
                      : step === 'verify'
                        ? state.complete
                        : !!state.account?.connected &&
                          (state.grants.length > 0 ||
                            (targetRows?.accountKey === accountKey &&
                              targetRows.targets.some(
                                (target) => target.receiveScope?.kind === 'group',
                              )));
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
    </section>
  );
}
