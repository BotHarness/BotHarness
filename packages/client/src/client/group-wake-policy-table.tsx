import { externalPlatformLabel } from './bridge-source-label.js';
import { subscribeMessagingDefaults } from './messaging-defaults-live.js';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import { useRef, useState, type ReactElement } from 'react';
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { GroupMemberWakePolicy } from '../../../core/src/channels/channel.js';
import type { BridgeActions } from './actions.js';
import type { ChannelSummary } from './store.js';
import type { BotHarnessTranslate } from './locale.js';
import { MemberWakePolicyModal } from './group-member-controls.js';
import { useMountedResource } from './mounted-resource.js';

export function GroupWakePolicyTable({
  channel,
  botNames,
  actions,
  t,
}: {
  channel: ChannelSummary;
  botNames: ReadonlyMap<string, string>;
  actions: Pick<BridgeActions, 'groupWakePolicies' | 'setGroupWakePolicy'>;
  t: BotHarnessTranslate;
}): ReactElement {
  const [members, setMembers] = useState<GroupMemberWakePolicy[]>();
  const [selected, setSelected] = useState<GroupMemberWakePolicy>();
  const [error, setError] = useState(false);
  const mounted = useRef(false);
  const generation = useRef(0);
  const refresh = async () => {
    const version = generation.current;
    try {
      const value = await actions.groupWakePolicies(channel.id);
      if (mounted.current && version === generation.current) {
        setMembers(value);
        setError(false);
      }
    } catch {
      if (mounted.current && version === generation.current) setError(true);
    }
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    mounted.current = true;
    ++generation.current;
    setMembers(undefined);
    void refresh();
    const unsubscribeDefaults = subscribeMessagingDefaults(() => void refresh());
    return () => {
      unsubscribeDefaults();
      mounted.current = false;
      ++generation.current;
    };
  }, [channel.id, channel.updatedAt, actions]);
  return (
    <div ref={mount} className="bh-profile-section" role="region" aria-label={t('groupWake.title')}>
      <header className="bh-identity-header">
        <div>
          <strong>{t('groupWake.title')}</strong>
          <p>{t('groupWake.summary')}</p>
        </div>
        <Button onClick={() => void refresh()}>{t('im.refresh')}</Button>
      </header>
      {error ? (
        <p className="bh-error" role="alert">
          {t('members.error')}
        </p>
      ) : null}
      {!members ? (
        <p>{t('im.loading')}</p>
      ) : (
        <div className="bh-bridge-table-wrap">
          <table className="bh-source-policy-table" aria-label={t('groupWake.title')}>
            <thead>
              <tr>
                {(
                  [
                    'groupWake.bot',
                    'groupWake.policy',
                    'groupWake.origin',
                    'bridge.actions',
                  ] as const
                ).map((key) => (
                  <th key={key} scope="col">
                    {t(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.botSlug}>
                  <th scope="row">{botNames.get(member.botSlug) ?? member.botSlug}</th>
                  <td>
                    {t(`members.wake.${member.policy.mode}`)}
                    {member.policy.mode === 'digest' ? (
                      <span className="bh-bridge-secondary">
                        {t('groupWake.threshold', {
                          count: member.policy.count,
                          seconds: member.policy.intervalSeconds,
                        })}
                      </span>
                    ) : null}
                    {(member.externals ?? (member.external ? [member.external] : [])).map(
                      (external) => (
                        <span key={external.platform} className="bh-bridge-secondary">
                          {t('defaults.externalWake', {
                            platform: externalPlatformLabel(external.platform, t),
                          })}
                          : {t(`members.wake.${external.policy.mode}`)}
                          {external.policy.mode === 'digest'
                            ? ` · ${t('groupWake.threshold', { count: external.policy.count, seconds: external.policy.intervalSeconds })}`
                            : ''}
                          <br />
                          {t(
                            external.origin === 'platform'
                              ? 'defaults.inherited'
                              : external.origin === 'channel'
                                ? 'groupWake.custom'
                                : 'groupWake.default',
                          )}
                          {external.origin === 'platform' ? ` · v${external.defaultRevision}` : ''}
                        </span>
                      ),
                    )}
                  </td>
                  <td>
                    <Tag tone="neutral">
                      {t(member.inherited ? 'groupWake.default' : 'groupWake.custom')}
                    </Tag>
                  </td>
                  <td>
                    <Button
                      aria-label={t('groupWake.edit', {
                        bot: botNames.get(member.botSlug) ?? member.botSlug,
                      })}
                      onClick={() => setSelected(member)}
                    >
                      {t('groupWake.editAction')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected ? (
        <MemberWakePolicyModal
          key={selected.botSlug}
          group={{
            ...channel,
            wakePolicies: { ...channel.wakePolicies, [selected.botSlug]: selected.policy },
          }}
          slug={selected.botSlug}
          name={botNames.get(selected.botSlug) ?? selected.botSlug}
          actions={actions}
          t={t}
          onClose={() => {
            setSelected(undefined);
            void refresh();
          }}
        />
      ) : null}
    </div>
  );
}
