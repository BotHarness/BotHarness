import { subscribeMessagingDefaults } from './messaging-defaults-live.js';
import { useRef, useState, type ReactElement } from 'react';
import { Button, Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import type {
  MessagingDefaults,
  MessagingDefaultsInput,
} from '../../../core/src/messaging/defaults.js';
import type { HumanNameSettingsProps } from './human-name-settings.js';
import { loadMessagingDefaults, saveMessagingDefaults } from './bridge.js';
import { useMountedResource } from './mounted-resource.js';

const platformLabels = {
  feishu: 'Lark / 飞书',
  slack: 'Slack',
  discord: 'Discord',
  weixin: 'WeChat / 微信',
} as const;

export function MessagingDefaultsSettings({
  call,
  t,
}: Pick<HumanNameSettingsProps, 'call' | 't'>): ReactElement {
  const [selected, setSelected] = useState<MessagingDefaultsInput['platform']>('feishu');
  return (
    <div className="bh-profile-section bh-messaging-defaults">
      <strong>{t('defaults.title')}</strong>
      <p>{t('defaults.summary')}</p>
      <label className="bh-default-platform">
        <span>{t('identity.platform')}</span>
        <select
          aria-label={t('defaults.platform')}
          value={selected}
          onChange={(e) =>
            setSelected(
              e.target.value === 'weixin'
                ? 'weixin'
                : e.target.value === 'discord'
                  ? 'discord'
                  : e.target.value === 'slack'
                    ? 'slack'
                    : 'feishu',
            )
          }
        >
          <option value="feishu">Lark / 飞书</option>
          <option value="slack">Slack</option>
          <option value="discord">Discord</option>
          <option value="weixin">WeChat / 微信</option>
        </select>
      </label>
      {(['feishu', 'slack', 'discord', 'weixin'] as const).map((platform) => (
        <div
          key={platform}
          hidden={selected !== platform}
          role="region"
          aria-label={platformLabels[platform]}
        >
          <PlatformDefaultsSettings call={call} t={t} platform={platform} />
        </div>
      ))}
    </div>
  );
}

function PlatformDefaultsSettings({
  call,
  t,
  platform,
}: Pick<HumanNameSettingsProps, 'call' | 't'> & {
  platform: MessagingDefaultsInput['platform'];
}): ReactElement {
  const [current, setCurrent] = useState<MessagingDefaults>();
  const [draft, setDraft] = useState<MessagingDefaults>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(false),
    dirty = useRef(false),
    pending = useRef(false),
    request = useRef(0);
  const refresh = async () => {
    const sequence = ++request.current;
    const value = await loadMessagingDefaults(call, platform);
    if (!mounted.current || sequence !== request.current) return;
    setCurrent(value);
    if (!dirty.current) {
      setDraft(value);
      setError('');
    }
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    mounted.current = true;
    const reload = () => {
      if (!pending.current)
        void refresh().catch(() => {
          if (mounted.current) setError(t('defaults.failed'));
        });
    };
    reload();
    const unsubscribeDefaults = subscribeMessagingDefaults(reload);
    return () => {
      mounted.current = false;
      ++request.current;
      unsubscribeDefaults();
    };
  }, [call, platform]);
  const change = (patch: Partial<MessagingDefaults>) => {
    dirty.current = true;
    setDraft((value) => (value ? { ...value, ...patch } : value));
    setError('');
  };
  const save = async () => {
    if (!draft || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    ++request.current;
    try {
      const input: MessagingDefaultsInput = {
        platform,
        expectedRevision: draft.revision,
        collection: draft.collection,
        wake: draft.wake,
        count: draft.count,
        intervalSeconds: draft.intervalSeconds,
        identityEnabled: draft.identityEnabled,
        ...(platform === 'weixin' ? { typingEnabled: draft.typingEnabled ?? true } : {}),
        newConversations: draft.newConversations ?? 'auto',
      };
      const value = await saveMessagingDefaults(call, input);
      if (mounted.current) {
        setCurrent(value);
        setDraft(value);
        dirty.current = false;
      }
    } catch (err) {
      if (mounted.current)
        setError(
          t(
            err instanceof Error && 'code' in err && err.code === 'defaults-stale'
              ? 'defaults.stale'
              : 'defaults.failed',
          ),
        );
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const valid =
    draft &&
    Number.isInteger(draft.count) &&
    draft.count >= 1 &&
    draft.count <= 100 &&
    Number.isInteger(draft.intervalSeconds) &&
    draft.intervalSeconds >= 1 &&
    draft.intervalSeconds <= 86400;
  return (
    <div className="bh-platform-defaults" ref={mount}>
      {error ? (
        <p className="bh-error" role="alert">
          {error}
        </p>
      ) : null}
      {!draft ? (
        <p>{t('im.loading')}</p>
      ) : (
        <>
          {platform === 'weixin' ? (
            <p className="bh-bridge-secondary">{t('defaults.weixinScope')}</p>
          ) : (
            <div className="bh-bridge-table-wrap">
              <table className="bh-source-policy-table" aria-label={t('defaults.intake')}>
                <thead>
                  <tr>
                    <th>{t('identity.platform')}</th>
                    <th>{t('bridge.condition')}</th>
                    <th>{t('im.ordinaryWake')}</th>
                    <th>{t('defaults.threshold')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">{platformLabels[platform]}</th>
                    <td>
                      <select
                        aria-label={t('defaults.collection')}
                        value={draft.collection}
                        disabled={busy}
                        onChange={(e) =>
                          change({ collection: e.target.value === 'all' ? 'all' : 'mentions' })
                        }
                      >
                        <option value="mentions">{t('bridge.mentions')}</option>
                        <option value="all">{t('bridge.all')}</option>
                      </select>
                    </td>
                    <td>
                      <select
                        aria-label={t('defaults.wake')}
                        value={draft.wake}
                        disabled={busy}
                        onChange={(e) =>
                          change({ wake: e.target.value as MessagingDefaults['wake'] })
                        }
                      >
                        {(['digest', 'immediate', 'mentions', 'silent'] as const).map((mode) => (
                          <option value={mode} key={mode}>
                            {t(`im.wake.${mode}`)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <label className="bh-default-threshold">
                        <span>{t('im.digestCount')}</span>
                        <input
                          aria-label={t('defaults.count')}
                          type="number"
                          min={1}
                          max={100}
                          value={draft.count}
                          disabled={busy || draft.wake !== 'digest'}
                          onChange={(e) => change({ count: Number(e.target.value) })}
                        />
                      </label>
                      <label className="bh-default-threshold">
                        <span>{t('im.digestSeconds')}</span>
                        <input
                          aria-label={t('defaults.seconds')}
                          type="number"
                          min={1}
                          max={86400}
                          value={draft.intervalSeconds}
                          disabled={busy || draft.wake !== 'digest'}
                          onChange={(e) => change({ intervalSeconds: Number(e.target.value) })}
                        />
                      </label>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          <p className="bh-bridge-secondary">{t('defaults.authorization')}</p>
          <table className="bh-source-policy-table" aria-label={t('defaults.identity')}>
            <thead>
              <tr>
                <th>{t('identity.platform')}</th>
                <th>{t('defaults.identity')}</th>
                <th>
                  {t(platform === 'weixin' ? 'identity.typing.label' : 'identity.newConversations')}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">{platformLabels[platform]}</th>
                <td>
                  <Switch
                    checked={draft.identityEnabled}
                    disabled={busy}
                    label={t('defaults.enableIdentity')}
                    onChange={(identityEnabled) => change({ identityEnabled })}
                  />
                </td>
                <td>
                  {platform === 'weixin' ? (
                    <Switch
                      checked={draft.typingEnabled ?? true}
                      disabled={busy}
                      label={t('defaults.enableTyping')}
                      onChange={(typingEnabled) => change({ typingEnabled })}
                    />
                  ) : (
                    <select
                      aria-label={t('identity.newConversations')}
                      value={draft.newConversations ?? 'auto'}
                      disabled={busy}
                      onChange={(e) =>
                        change({ newConversations: e.target.value === 'ask' ? 'ask' : 'auto' })
                      }
                    >
                      <option value="auto">{t('identity.newConversations.auto')}</option>
                      <option value="ask">{t('identity.newConversations.ask')}</option>
                    </select>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="bh-bridge-secondary">{t('defaults.scope')}</p>
          <p>{t('defaults.revision', { revision: current?.revision ?? draft.revision })}</p>
          <div className="bh-identity-actions">
            <Button disabled={busy || !valid || !dirty.current} onClick={() => void save()}>
              {t('defaults.save')}
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                dirty.current = false;
                void refresh().catch(() => setError(t('defaults.failed')));
              }}
            >
              {t('im.refresh')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
