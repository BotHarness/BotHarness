import { externalPlatformLabel } from './bridge-source-label.js';
import { subscribeMessagingDefaults } from './messaging-defaults-live.js';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import { useRef, useState, type ReactElement } from 'react';
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { GroupMemberWakePolicy } from '../../../core/src/channels/channel.js';
import type { BridgeActions } from './actions.js';
import type { ChannelSummary } from './store.js';
import type { BotHarnessTranslate } from './locale.js';
import { MemberWakePolicyModal } from './group-member-controls.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import { useMountedResource } from './mounted-resource.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';

function memberRule(member: GroupMemberWakePolicy, t: BotHarnessTranslate): string {
  const mode = t(`members.wake.${member.policy.mode}`);
  return member.policy.mode === 'digest'
    ? `${mode} · ${t('groupWake.threshold', {
        count: member.policy.count,
        seconds: member.policy.intervalSeconds,
      })}`
    : mode;
}

function externalRules(member: GroupMemberWakePolicy, t: BotHarnessTranslate): string[] {
  return (member.externals ?? (member.external ? [member.external] : [])).map((external) => {
    const mode = t(`members.wake.${external.policy.mode}`);
    const threshold =
      external.policy.mode === 'digest'
        ? ` · ${t('groupWake.threshold', { count: external.policy.count, seconds: external.policy.intervalSeconds })}`
        : '';
    const origin = t(
      external.origin === 'platform'
        ? 'defaults.inherited'
        : external.origin === 'channel'
          ? 'groupWake.custom'
          : 'groupWake.default',
    );
    const revision = external.origin === 'platform' ? ` v${external.defaultRevision}` : '';
    return `${t('defaults.externalWake', { platform: externalPlatformLabel(external.platform, t) })}: ${mode}${threshold} (${origin}${revision})`;
  });
}

export function GroupWakePolicyList({
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
    <div ref={mount} className="bh-group-wake-entry">
      {error ? (
        <p className="bh-error" role="alert">
          {t('members.error')}
        </p>
      ) : null}
      {!members ? (
        error ? null : (
          <LoadingSkeleton kind="sidebar" label={t('im.loading')} />
        )
      ) : members.length === 0 ? (
        <div className="bh-note">{t('members.empty')}</div>
      ) : (
        <SidebarCardList label={t('groupWake.title')}>
          {members.map((member) => {
            const name = botNames.get(member.botSlug) ?? member.botSlug;
            const externals = externalRules(member, t);
            return (
              <SidebarCardRow
                key={member.botSlug}
                icon="bot"
                title={name}
                chips={
                  member.inherited ? undefined : <Tag tone="info">{t('groupWake.custom')}</Tag>
                }
                meta={
                  externals.length === 0 ? (
                    memberRule(member, t)
                  ) : (
                    <>
                      {memberRule(member, t)}
                      {externals.map((line) => (
                        <span key={line} className="bh-card-meta-line">
                          {line}
                        </span>
                      ))}
                    </>
                  )
                }
                hint={t('groupWake.edit', { bot: name })}
                dialog
                onClick={() => setSelected(member)}
              />
            );
          })}
        </SidebarCardList>
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
