import { useMemo, useState, type ReactElement } from 'react';

import { Button, MarkdownText, type MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives';

import { channelAttachmentUrl, errorMessage } from './bridge.js';
import type { BridgeActions, HostDirectoryListing } from './actions.js';
import { FolderBrowser, WORKSPACE_GRANTS_CHANGED } from './workspace-grants-entry.js';
import type { BotHarnessTranslate } from './locale.js';
import { store, type ChannelMessage } from './store.js';

// DSH's memoized primitive carries React 19 types; this Client still uses React 18 types.
const ChannelMarkdownText = MarkdownText as unknown as (
  props: Parameters<typeof MarkdownText>[0],
) => ReactElement;

function GrantRequestCard({
  message,
  actions,
  resolved,
  t,
}: {
  message: ChannelMessage;
  actions: BridgeActions;
  resolved: boolean;
  t: BotHarnessTranslate;
}): ReactElement {
  const [listing, setListing] = useState<HostDirectoryListing | undefined>();
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const botSlug = message.author.kind === 'bot' ? message.author.slug : undefined;
  const open = (): void => {
    if (botSlug === undefined || busy || opening) return;
    setOpening(true);
    setError(undefined);
    void actions
      .listHostFolders()
      .then(setListing, (cause: unknown) => {
        setError(errorMessage(cause));
      })
      .finally(() => setOpening(false));
  };
  const approve = (path: string): void => {
    if (botSlug === undefined || busy) return;
    setBusy(true);
    setError(undefined);
    void (async () => {
      try {
        const expectedChannel = `dm-${botSlug}`;
        if (store.getSnapshot().conversation.channel?.id !== expectedChannel) {
          throw new Error(t('grant.requestChannelChanged'));
        }
        const grant = await actions.authorizeWorkspacePath(botSlug, path);
        window.dispatchEvent(
          new CustomEvent(WORKSPACE_GRANTS_CHANGED, { detail: { slug: botSlug } }),
        );
        if (store.getSnapshot().conversation.channel?.id !== expectedChannel) {
          throw new Error(t('grant.requestChannelChanged'));
        }
        const sent = await actions.send(
          t('grant.requestApprovedMessage', { name: grant.workspaceTitle }),
          message.id,
        );
        if (!sent) throw new Error(t('grant.requestContinueFailed'));
        setCompleted(true);
        setListing(undefined);
      } catch (cause) {
        setError(errorMessage(cause));
      } finally {
        setBusy(false);
      }
    })();
  };
  return (
    <div className="bh-grant-request-card">
      <div className="bh-grant-request-title">{t('grant.requestTitle')}</div>
      <div className="bh-grant-request-reason">{message.body}</div>
      {resolved || completed ? (
        <div className="bh-note" role="status">
          {t('grant.requestResolved')}
        </div>
      ) : (
        <Button variant="primary" disabled={busy || opening} onClick={open}>
          {opening ? t('grant.loading') : t('grant.requestChoose')}
        </Button>
      )}
      {error === undefined ? null : (
        <div className="bh-error" role="alert">
          {error}
        </div>
      )}
      {listing === undefined ? null : (
        <FolderBrowser
          initial={listing}
          actions={actions}
          onCancel={() => setListing(undefined)}
          onChoose={approve}
          busy={busy}
          t={t}
        />
      )}
    </div>
  );
}

export function ChannelMessageBody({
  message,
  t,
  actions,
  grantRequestResolved = false,
}: {
  message: ChannelMessage;
  t: BotHarnessTranslate;
  actions?: BridgeActions;
  grantRequestResolved?: boolean;
}): ReactElement {
  const labels = useMemo<MarkdownLabels>(
    () => ({
      code: {
        copyLabel: t('message.code.copy'),
        copiedLabel: t('message.code.copied'),
      },
      footnotes: t('message.footnotes'),
    }),
    [t],
  );
  const format = message.format ?? (message.author.kind === 'human' ? 'text' : 'markdown');
  if (message.grantRequest === true && actions !== undefined) {
    return (
      <GrantRequestCard message={message} actions={actions} resolved={grantRequestResolved} t={t} />
    );
  }
  return (
    <div className="bh-bubble-content">
      {message.body.length === 0 ? null : format === 'text' ? (
        <div className="bh-bubble-body">{message.body}</div>
      ) : (
        <div className="bh-bubble-body bh-bubble-body-markdown">
          <ChannelMarkdownText
            text={message.body}
            streaming={message.streaming === true}
            labels={labels}
          />
        </div>
      )}
      {message.attachments?.length ? (
        <div className="bh-message-attachments">
          {message.attachments.map((ref, index) => {
            const url = channelAttachmentUrl(ref);
            return ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(ref.mime) ? (
              <a
                className="bh-message-image-link"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                key={`${ref.hash}-${index}`}
              >
                <img className="bh-message-image" src={url} alt={ref.name} loading="lazy" />
              </a>
            ) : (
              <a
                className="bh-message-file"
                href={url}
                download={ref.name}
                key={`${ref.hash}-${index}`}
              >
                <span aria-hidden="true">▤</span> {ref.name} ·{' '}
                {Math.max(1, Math.round(ref.size / 1024))} KB
              </a>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
