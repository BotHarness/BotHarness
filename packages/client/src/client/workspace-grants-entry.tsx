import { useEffect, useState, type ReactElement } from 'react';
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives';

import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import type { WorkspaceGrantView, WorkspaceOption } from './bridge.js';
import { errorMessage } from './bridge.js';

/** Human-facing Grant management for the selected PersonaBot. */
export function WorkspaceGrantsEntry({
  botSlug,
  actions,
  t,
}: ChannelSidebarEntryProps): ReactElement {
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [grants, setGrants] = useState<WorkspaceGrantView[]>([]);
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  const refresh = async (slug: string): Promise<void> => {
    const [available, owned] = await Promise.all([
      actions.listWorkspaceOptions(),
      actions.listWorkspaceGrants(slug),
    ]);
    setWorkspaces(available);
    setGrants(owned);
  };

  useEffect(() => {
    if (botSlug === undefined) return;
    let cancelled = false;
    setLoading(true);
    void Promise.all([actions.listWorkspaceOptions(), actions.listWorkspaceGrants(botSlug)]).then(
      ([available, owned]) => {
        if (cancelled) return;
        setWorkspaces(available);
        setGrants(owned);
        setLoading(false);
      },
      (cause: unknown) => {
        if (cancelled) return;
        setError(errorMessage(cause));
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [actions, botSlug]);

  const mutate = (id: string, action: () => Promise<unknown>): void => {
    if (botSlug === undefined || busy !== undefined) return;
    setBusy(id);
    setError(undefined);
    void (async () => {
      try {
        await action();
        await refresh(botSlug);
      } catch (cause) {
        setError(errorMessage(cause));
      } finally {
        setBusy(undefined);
      }
    })();
  };

  if (botSlug === undefined) return <div className="bh-note">{t('grant.noBot')}</div>;
  const activeIds = new Set(
    grants.filter((grant) => grant.revokedAt === undefined).map((grant) => grant.workspaceId),
  );
  return (
    <div className="bh-workspace-grants">
      <div className="bh-note">{t('grant.safeDefault')}</div>
      {loading ? <div className="bh-note">{t('grant.loading')}</div> : null}
      {error === undefined ? null : (
        <div className="bh-error" role="alert">
          {error}
        </div>
      )}
      {grants.map((grant) => (
        <div className="bh-workspace-grant" key={grant.id}>
          <div className="bh-workspace-grant-title">
            {grant.workspaceTitle}{' '}
            <Tag tone="neutral">
              {grant.revokedAt === undefined ? 'workspace-write' : t('grant.revoked')}
            </Tag>
          </div>
          <div className="bh-workspace-grant-path" title={grant.workspacePath}>
            {grant.workspacePath}
          </div>
          {grant.revokedAt === undefined ? (
            <Button
              variant="outline"
              disabled={busy !== undefined}
              onClick={() =>
                mutate(grant.id, () => actions.revokeWorkspaceGrant(botSlug, grant.id))
              }
            >
              {t('grant.revoke')}
            </Button>
          ) : (
            <div className="bh-note">{t('grant.stopRunning')}</div>
          )}
        </div>
      ))}
      {workspaces
        .filter((workspace) => !activeIds.has(workspace.id))
        .map((workspace) => (
          <div className="bh-workspace-grant" key={workspace.id}>
            <div className="bh-workspace-grant-title">{workspace.title}</div>
            <div className="bh-workspace-grant-path" title={workspace.path}>
              {workspace.path}
            </div>
            <Button
              variant="outline"
              disabled={busy !== undefined}
              onClick={() =>
                mutate(workspace.id, () => actions.createWorkspaceGrant(botSlug, workspace.id))
              }
            >
              {t('grant.authorize')}
            </Button>
          </div>
        ))}
      {!loading && workspaces.length === 0 ? (
        <div className="bh-note">{t('grant.noWorkspace')}</div>
      ) : null}
    </div>
  );
}
