import { useState, type ReactElement } from 'react';
import {
  IconEditOutlineRegular,
  IconInfoOutlineRegular,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { BotSourcePolicyEdit, BotSourcePolicyView } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import { Modal } from './modal.js';

type EditablePolicy = BotSourcePolicyView & {
  sourceClass: BotSourcePolicyEdit['sourceClass'];
};
function editable(policy: BotSourcePolicyView): policy is EditablePolicy {
  return ['human-dm', 'bot-dm', 'group-mention', 'group-ordinary', 'assignment-report'].includes(
    policy.sourceClass,
  );
}
function sourceName(policy: BotSourcePolicyView, t: BotHarnessTranslate): string {
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
function rule(policy: BotSourcePolicyView, t: BotHarnessTranslate, compact: boolean): string {
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
function actor(policy: BotSourcePolicyView, t: BotHarnessTranslate): string {
  if (policy.lastActor.kind === 'human') return t('sourcePolicy.human');
  if (policy.lastActor.kind === 'bot')
    return t('sourcePolicy.botActor', { slug: policy.lastActor.botSlug });
  return t('sourcePolicy.builtIn');
}

export function SourcePolicyTable({
  policies,
  t,
  onEdit,
}: {
  policies: readonly BotSourcePolicyView[];
  t: BotHarnessTranslate;
  onEdit(policy: EditablePolicy): void;
}): ReactElement {
  const [detailsClass, setDetailsClass] = useState<BotSourcePolicyView['sourceClass']>();
  const details = policies.find((policy) => policy.sourceClass === detailsClass);
  return (
    <>
      <table className="bh-source-policy-table" aria-label={t('sourcePolicy.defaults')}>
        <thead>
          <tr>
            <th scope="col">{t('sourcePolicy.sourceColumn')}</th>
            <th scope="col">{t('sourcePolicy.ruleColumn')}</th>
            <th scope="col">{t('sourcePolicy.wakesColumn')}</th>
            <th scope="col">{t('sourcePolicy.actionsColumn')}</th>
          </tr>
        </thead>
        <tbody>
          {policies.map((policy) => {
            const name = sourceName(policy, t);
            return (
              <tr
                key={policy.sourceClass}
                className="bh-source-policy-row"
                data-source-class={policy.sourceClass}
              >
                <th scope="row">{name}</th>
                <td>{rule(policy, t, true)}</td>
                <td className="bh-source-policy-count">{policy.recentWakeCount}</td>
                <td>
                  <div className="bh-source-policy-actions">
                    {editable(policy) ? (
                      <Tooltip
                        label={t('sourcePolicy.editFor', { source: name })}
                        side="bottom"
                        portal
                        delayMs={400}
                      >
                        <button
                          type="button"
                          className="bh-icon-btn bh-source-policy-action"
                          aria-label={t('sourcePolicy.editFor', { source: name })}
                          onClick={() => onEdit(policy)}
                        >
                          <IconEditOutlineRegular size={16} />
                        </button>
                      </Tooltip>
                    ) : (
                      <span className="bh-source-policy-read-only">
                        {t('sourcePolicy.readOnly')}
                      </span>
                    )}
                    <Tooltip
                      label={t('sourcePolicy.detailsFor', { source: name })}
                      side="bottom"
                      portal
                      delayMs={400}
                    >
                      <button
                        type="button"
                        className="bh-icon-btn bh-source-policy-action"
                        aria-label={t('sourcePolicy.detailsFor', { source: name })}
                        onClick={() => setDetailsClass(policy.sourceClass)}
                      >
                        <IconInfoOutlineRegular size={16} />
                      </button>
                    </Tooltip>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {details !== undefined && (
        <Modal
          open
          onClose={() => setDetailsClass(undefined)}
          title={sourceName(details, t)}
          closeLabel={t('common.close')}
          description={t('sourcePolicy.detailsTitle')}
        >
          <dl className="bh-source-policy-audit">
            <div>
              <dt>{t('sourcePolicy.ruleColumn')}</dt>
              <dd>
                {rule(details, t, false)}
                {details.sourceClass === 'group-ordinary' && (
                  <p className="bh-note">{t('sourcePolicy.groupOverride')}</p>
                )}
              </dd>
            </div>
            <div>
              <dt>{t('sourcePolicy.wakesColumn')}</dt>
              <dd>{details.recentWakeCount}</dd>
            </div>
            <div>
              <dt>{t('sourcePolicy.auditColumn')}</dt>
              <dd>
                {t('sourcePolicy.revision', { revision: details.revision })} · {actor(details, t)}
                {!details.overrideActive &&
                  (details.lastActor.kind === 'human' || details.lastActor.kind === 'bot') && (
                    <> · {t('sourcePolicy.restoredDefault')}</>
                  )}
              </dd>
            </div>
            <div>
              <dt>{t('sourcePolicy.changedAt')}</dt>
              <dd>
                <time dateTime={details.changedAt}>
                  {new Date(details.changedAt).toLocaleString()}
                </time>
              </dd>
            </div>
          </dl>
        </Modal>
      )}
    </>
  );
}
