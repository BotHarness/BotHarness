import type { ReactElement } from 'react';
import type { BotSourcePolicyEdit, BotSourcePolicyView } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import { Modal } from './modal.js';

export type EditablePolicy = BotSourcePolicyView & {
  sourceClass: BotSourcePolicyEdit['sourceClass'];
};
export function editable(policy: BotSourcePolicyView): policy is EditablePolicy {
  return ['human-dm', 'bot-dm', 'group-mention', 'group-ordinary', 'assignment-report'].includes(
    policy.sourceClass,
  );
}
export function sourceName(policy: BotSourcePolicyView, t: BotHarnessTranslate): string {
  return {
    'human-dm': t('sourcePolicy.humanDm'),
    'bot-dm': t('sourcePolicy.botDm'),
    'group-mention': t('sourcePolicy.groupMention'),
    'group-ordinary': t('sourcePolicy.groupOrdinary'),
    'group-invite': t('sourcePolicy.groupInvite'),
    'group-join-request': t('sourcePolicy.groupJoinRequest'),
    'group-join-decision': t('sourcePolicy.groupJoinDecision'),
    'assignment-report': t('sourcePolicy.assignmentReport'),
    'assignment-lifecycle': t('sourcePolicy.assignmentLifecycle'),
  }[policy.sourceClass];
}
export function rule(
  policy: BotSourcePolicyView,
  t: BotHarnessTranslate,
  compact: boolean,
): string {
  let label: string;
  if (policy.wake === 'digest') {
    label = t(compact ? 'sourcePolicy.compactDigest' : 'sourcePolicy.admitDigest', {
      count: policy.digestCount ?? 0,
      seconds: policy.digestIntervalSeconds ?? 0,
    });
  } else if (policy.wake === 'conditional') {
    label = t(compact ? 'sourcePolicy.compactConditional' : 'sourcePolicy.admitConditional');
  } else if (policy.wake === 'mentions') {
    label = t(compact ? 'sourcePolicy.compactMentions' : 'sourcePolicy.admitMentions');
  } else if (policy.wake === 'silent') {
    label = t(compact ? 'sourcePolicy.compactSilent' : 'sourcePolicy.admitSilent');
  } else {
    label = t(compact ? 'sourcePolicy.compactImmediate' : 'sourcePolicy.admitImmediate');
  }
  if (['human-dm', 'bot-dm', 'group-mention'].includes(policy.sourceClass)) {
    label += ` · ${t(policy.delivery === 'turn' ? 'sourcePolicy.deliveryTurn' : 'sourcePolicy.deliverySteer')}`;
  }
  return label;
}
export function actor(policy: BotSourcePolicyView, t: BotHarnessTranslate): string {
  if (policy.lastActor.kind === 'human') return t('sourcePolicy.human');
  if (policy.lastActor.kind === 'bot')
    return t('sourcePolicy.botActor', { slug: policy.lastActor.botSlug });
  return t('sourcePolicy.builtIn');
}

export function SourcePolicyDetails({
  policy,
  t,
  onClose,
}: {
  policy: BotSourcePolicyView;
  t: BotHarnessTranslate;
  onClose(): void;
}): ReactElement {
  return (
    <Modal
      open
      onClose={onClose}
      title={sourceName(policy, t)}
      closeLabel={t('common.close')}
      description={t('sourcePolicy.detailsTitle')}
    >
      <dl className="bh-source-policy-audit">
        <div>
          <dt>{t('sourcePolicy.ruleColumn')}</dt>
          <dd>
            {rule(policy, t, false)}
            {policy.sourceClass === 'group-ordinary' && (
              <p className="bh-note">{t('sourcePolicy.groupOverride')}</p>
            )}
          </dd>
        </div>
        <div>
          <dt>{t('sourcePolicy.wakesColumn')}</dt>
          <dd>{policy.recentWakeCount}</dd>
        </div>
        <div>
          <dt>{t('sourcePolicy.auditColumn')}</dt>
          <dd>
            {t('sourcePolicy.revision', { revision: policy.revision })} · {actor(policy, t)}
            {!policy.overrideActive &&
              (policy.lastActor.kind === 'human' || policy.lastActor.kind === 'bot') && (
                <> · {t('sourcePolicy.restoredDefault')}</>
              )}
          </dd>
        </div>
        <div>
          <dt>{t('sourcePolicy.changedAt')}</dt>
          <dd>
            <time dateTime={policy.changedAt}>{new Date(policy.changedAt).toLocaleString()}</time>
          </dd>
        </div>
      </dl>
    </Modal>
  );
}
