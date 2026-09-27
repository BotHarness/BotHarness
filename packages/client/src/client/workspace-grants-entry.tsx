import { useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import {
  Button,
  IconChevronDownOutlineRegular,
  IconCloseOutlineRegular,
  IconFolderOpenOutlineRegular,
  Input,
  Switch,
} from '@deepseek-ai/dsh-client-ui-primitives';

import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import type { HostDirectoryListing } from './actions.js';
import type {
  WorkspaceGrantView,
  WorkspaceOption,
  ToolApprovalRuleView,
  AssignmentAccessPresetView,
} from './bridge.js';
import { errorMessage } from './bridge.js';
import { Modal } from './modal.js';

export const WORKSPACE_GRANTS_CHANGED = 'botharness/workspace-grants-changed';

const WORKSPACE_ACTION_TIMEOUT_MS = 15_000;

function withWorkspaceActionDeadline<T>(promise: Promise<T>, timeoutMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error(timeoutMessage)),
      WORKSPACE_ACTION_TIMEOUT_MS,
    );
    void promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (cause: unknown) => {
        window.clearTimeout(timer);
        reject(cause);
      },
    );
  });
}

function approvalRulePath(rule: ToolApprovalRuleView): string {
  try {
    const scope = JSON.parse(rule.scopeKey) as unknown;
    if (Array.isArray(scope) && typeof scope[1] === 'string') return scope[1];
  } catch {
    // An older rule still remains revocable even if its scope shape changes.
  }
  return rule.scopeKey;
}

function FolderRow({
  name,
  path,
  remove,
  removeLabel,
  disabled,
  detail,
}: {
  name: string;
  path: string;
  remove?: () => void;
  removeLabel?: string;
  disabled?: boolean;
  detail?: ReactNode;
}): ReactElement {
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  return (
    <div className="bh-workspace-folder-row">
      <div className="bh-workspace-folder-main">
        <button
          type="button"
          className="bh-workspace-folder-toggle"
          aria-expanded={expanded}
          aria-controls={detailId}
          onClick={() => setExpanded((value) => !value)}
        >
          <IconChevronDownOutlineRegular
            size={14}
            className={
              expanded ? 'bh-workspace-folder-chevron bh-expanded' : 'bh-workspace-folder-chevron'
            }
          />
          <span className="bh-workspace-folder-name" title={name}>
            {name}
          </span>
        </button>
        {remove === undefined ? null : (
          <button
            type="button"
            className="bh-workspace-folder-remove"
            aria-label={removeLabel}
            title={removeLabel}
            disabled={disabled}
            onClick={remove}
          >
            <IconCloseOutlineRegular size={16} />
          </button>
        )}
      </div>
      {expanded ? (
        <div id={detailId} className="bh-workspace-folder-detail">
          <div className="bh-workspace-folder-path" title={path}>
            {path}
          </div>
          {detail}
        </div>
      ) : null}
    </div>
  );
}

function pickerUnavailable(cause: unknown): boolean {
  if (typeof cause !== 'object' || cause === null || !('rpcError' in cause)) return false;
  const rpcError = cause.rpcError;
  return (
    typeof rpcError === 'object' &&
    rpcError !== null &&
    'code' in rpcError &&
    rpcError.code === 'directory-picker/unavailable'
  );
}

export function FolderBrowser({
  initial,
  actions,
  onCancel,
  onChoose,
  busy,
  t,
}: {
  initial: HostDirectoryListing;
  actions: ChannelSidebarEntryProps['actions'];
  onCancel: () => void;
  onChoose: (path: string) => void;
  busy: boolean;
  t: ChannelSidebarEntryProps['t'];
}): ReactElement {
  const [listing, setListing] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [showHidden, setShowHidden] = useState(false);
  const request = useRef<AbortController | undefined>();

  useEffect(() => () => request.current?.abort(), []);

  const navigate = (path: string): void => {
    if (busy) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(undefined);
    void actions
      .listHostFolders(path, controller.signal)
      .then(
        (next) => {
          if (!controller.signal.aborted) setListing(next);
        },
        (cause: unknown) => {
          if (!controller.signal.aborted) setError(errorMessage(cause));
        },
      )
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  };

  return (
    <Modal
      open
      title={t('grant.browseTitle')}
      description={t('grant.browseHelp')}
      closeLabel={t('common.close')}
      onClose={() => {
        if (!busy) onCancel();
      }}
      className="bh-folder-browser"
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={busy || loading}
            onClick={() => onChoose(listing.path)}
          >
            {t('grant.authorize')}
          </Button>
        </>
      }
    >
      <div className="bh-folder-browser-crumbs" aria-label={t('grant.browseLocation')}>
        {listing.crumbs.map((crumb, index) => (
          <button
            type="button"
            key={crumb.path}
            className="bh-folder-browser-crumb"
            aria-current={index === listing.crumbs.length - 1 ? 'location' : undefined}
            disabled={busy || loading}
            onClick={() => navigate(crumb.path)}
          >
            {crumb.name}
          </button>
        ))}
      </div>
      <div className="bh-folder-browser-list" role="list" aria-label={t('grant.browseFolders')}>
        {listing.entries
          .filter((entry) => showHidden || !entry.hidden)
          .map((entry) => (
            <button
              type="button"
              role="listitem"
              key={entry.path}
              className="bh-folder-browser-item"
              disabled={busy || loading}
              onClick={() => navigate(entry.path)}
            >
              <IconFolderOpenOutlineRegular size={16} />
              <span>{entry.name}</span>
            </button>
          ))}
        {listing.entries.length === 0 ? (
          <div className="bh-note">{t('grant.browseEmpty')}</div>
        ) : null}
      </div>
      {listing.truncated ? <div className="bh-note">{t('grant.browseTruncated')}</div> : null}
      {loading ? <div className="bh-note">{t('grant.loading')}</div> : null}
      {error === undefined ? null : (
        <div className="bh-error" role="alert">
          {error}
        </div>
      )}
      <label className="bh-folder-browser-hidden">
        <input
          type="checkbox"
          checked={showHidden}
          onChange={(event) => setShowHidden(event.target.checked)}
        />
        {t('grant.showHidden')}
      </label>
    </Modal>
  );
}

/** Human-facing file access for one PersonaBot. DSH Workspace rows are candidates, not Grants. */
export function WorkspaceGrantsEntry({
  botSlug,
  actions,
  t,
  developerMode = false,
}: ChannelSidebarEntryProps & { developerMode?: boolean }): ReactElement {
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [grants, setGrants] = useState<WorkspaceGrantView[]>([]);
  const [rules, setRules] = useState<ToolApprovalRuleView[]>([]);
  const [access, setAccess] = useState<AssignmentAccessPresetView>();
  const [confirmDanger, setConfirmDanger] = useState(false);
  const [memoryDir, setMemoryDir] = useState<string | undefined>();
  const [manualOpen, setManualOpen] = useState(false);
  const [manualPath, setManualPath] = useState('');
  const [browserListing, setBrowserListing] = useState<HostDirectoryListing | undefined>();
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  const refresh = async (slug: string, isCurrent: () => boolean = () => true): Promise<void> => {
    const owned = await withWorkspaceActionDeadline(
      actions.listWorkspaceGrants(slug),
      t('grant.loadTimeout'),
    );
    if (!isCurrent()) return;
    setGrants(owned);
    setLoading(false);
    const [available, memory, ruleRows, preset] = await Promise.all([
      actions.listWorkspaceOptions(),
      actions.memoryDirectory(slug),
      actions.listToolApprovalRules(slug),
      actions.assignmentAccess(slug),
    ]);
    if (!isCurrent()) return;
    setWorkspaces(available);
    setMemoryDir(memory);
    setRules(ruleRows);
    setAccess(preset);
  };
  useEffect(() => {
    if (botSlug === undefined) return;
    const onGrantChanged = (event: Event): void => {
      if ((event as CustomEvent<{ slug: string }>).detail?.slug !== botSlug) return;
      void refresh(botSlug).catch((cause: unknown) => setError(errorMessage(cause)));
    };
    window.addEventListener(WORKSPACE_GRANTS_CHANGED, onGrantChanged);
    return () => window.removeEventListener(WORKSPACE_GRANTS_CHANGED, onGrantChanged);
  }, [actions, botSlug]);

  useEffect(() => {
    if (botSlug === undefined) return;
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    void refresh(botSlug, () => !cancelled).catch((cause: unknown) => {
      if (cancelled) return;
      setError(errorMessage(cause));
      setLoading(false);
    });
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
        const operation = action().then((value) => {
          window.dispatchEvent(
            new CustomEvent(WORKSPACE_GRANTS_CHANGED, { detail: { slug: botSlug } }),
          );
          return value;
        });
        await withWorkspaceActionDeadline(operation, t('grant.operationTimeout'));
      } catch (cause) {
        setError(errorMessage(cause));
      } finally {
        setBusy(undefined);
      }
    })();
  };

  const openFolderBrowser = (): void => {
    if (botSlug === undefined || busy !== undefined) return;
    setBusy('folder-picker');
    setError(undefined);
    void (async () => {
      try {
        setBrowserListing(await actions.listHostFolders());
      } catch (cause) {
        if (pickerUnavailable(cause)) {
          try {
            await actions.addWorkspaceFolder(botSlug);
            await refresh(botSlug);
          } catch (nativeCause) {
            setError(errorMessage(nativeCause));
          }
        } else {
          setError(errorMessage(cause));
        }
      } finally {
        setBusy(undefined);
      }
    })();
  };

  if (botSlug === undefined) return <div className="bh-note">{t('grant.noBot')}</div>;
  const active = grants.filter((grant) => grant.revokedAt === undefined);
  const revoked = grants.filter((grant) => grant.revokedAt !== undefined);
  const activeIds = new Set(active.map((grant) => grant.workspaceId));
  const available = workspaces.filter((workspace) => !activeIds.has(workspace.id));

  return (
    <div className="bh-workspace-grants">
      {developerMode ? <div className="bh-note">{t('grant.safeDefault')}</div> : null}
      {loading ? <div className="bh-note">{t('grant.loading')}</div> : null}
      {error === undefined ? null : (
        <div className="bh-error" role="alert">
          {error}
        </div>
      )}
      <div className="bh-workspace-folder-table">
        <FolderRow name={t('grant.memory')} path={memoryDir ?? ''} />
        {active.map((grant) => (
          <FolderRow
            key={grant.id}
            name={grant.workspaceTitle}
            path={grant.workspacePath}
            disabled={busy !== undefined}
            removeLabel={t('grant.removeFolder') + ': ' + grant.workspaceTitle}
            remove={() =>
              mutate(grant.id, async () => {
                const revokedGrant = await actions.revokeWorkspaceGrant(botSlug, grant.id);
                setGrants((current) =>
                  current.map((row) => (row.id === revokedGrant.id ? revokedGrant : row)),
                );
              })
            }
          />
        ))}
      </div>
      <Button variant="outline" disabled={busy !== undefined} onClick={openFolderBrowser}>
        {t('grant.addFolder')}
      </Button>
      {busy === undefined ? null : (
        <div className="bh-note" role="status">
          {t('grant.working')}
        </div>
      )}
      {developerMode ? (
        <details
          className="bh-workspace-folder-secondary"
          open={manualOpen}
          onToggle={(event) => setManualOpen(event.currentTarget.open)}
        >
          <summary>{t('grant.enterPath')}</summary>
          <div className="bh-workspace-folder-manual">
            <div className="bh-note">{t('grant.pathHelp')}</div>
            <Input
              aria-label={t('grant.pathLabel')}
              placeholder={t('grant.pathPlaceholder')}
              value={manualPath}
              onChange={(event) => setManualPath(event.target.value)}
            />
            <Button
              variant="outline"
              disabled={busy !== undefined || manualPath.trim().length === 0}
              onClick={() =>
                mutate('manual-folder', async () => {
                  await actions.authorizeWorkspacePath(botSlug, manualPath.trim());
                  setManualPath('');
                  setManualOpen(false);
                })
              }
            >
              {t('grant.authorize')}
            </Button>
          </div>
        </details>
      ) : null}
      {!developerMode || available.length === 0 ? null : (
        <details className="bh-workspace-folder-secondary">
          <summary>{t('grant.registeredFolders')}</summary>
          <div className="bh-workspace-folder-table">
            {available.map((workspace) => (
              <FolderRow
                key={workspace.id}
                name={workspace.title}
                path={workspace.path}
                detail={
                  <Button
                    variant="outline"
                    disabled={busy !== undefined}
                    onClick={() =>
                      mutate(workspace.id, () =>
                        actions.createWorkspaceGrant(botSlug, workspace.id),
                      )
                    }
                  >
                    {t('grant.authorize')}
                  </Button>
                }
              />
            ))}
          </div>
        </details>
      )}
      {!developerMode || revoked.length === 0 ? null : (
        <details className="bh-workspace-folder-secondary">
          <summary>
            {t('grant.history')} ({revoked.length})
          </summary>
          <div className="bh-workspace-folder-table">
            {revoked.map((grant) => (
              <FolderRow key={grant.id} name={grant.workspaceTitle} path={grant.workspacePath} />
            ))}
          </div>
        </details>
      )}
      <div className="bh-assignment-access-row">
        <div>
          <div className="bh-grant-request-title">{t('access.title')}</div>
          <div className="bh-note">{t('access.description')}</div>
        </div>
        <Switch
          checked={access?.mode === 'danger-full-access'}
          disabled={loading || busy !== undefined}
          onChange={(checked) => {
            if (checked) {
              setConfirmDanger(true);
            } else {
              setConfirmDanger(false);
              mutate('safe-access', () =>
                actions.setAssignmentAccess(botSlug, 'workspace-write', false),
              );
            }
          }}
          label={t('access.title')}
        />
      </div>
      {access?.mode === 'danger-full-access' ? (
        <div className="bh-access-warning" role="status">
          {t('access.activeWarning')}
        </div>
      ) : null}
      {confirmDanger ? (
        <div className="bh-access-warning" role="group" aria-label={t('access.confirmTitle')}>
          <div className="bh-grant-request-title">{t('access.confirmTitle')}</div>
          <div className="bh-note">{t('access.confirmRisk')}</div>
          <div className="bh-tool-approval-actions">
            <Button
              variant="primary"
              disabled={busy !== undefined}
              onClick={() =>
                mutate('danger-access', async () => {
                  await actions.setAssignmentAccess(botSlug, 'danger-full-access', true);
                  setConfirmDanger(false);
                })
              }
            >
              {t('access.confirmEnable')}
            </Button>
            <Button
              variant="outline"
              disabled={busy !== undefined}
              onClick={() => setConfirmDanger(false)}
            >
              {t('approval.cancel')}
            </Button>
          </div>
        </div>
      ) : null}
      {rules.filter((rule) => rule.revokedAt === undefined).length === 0 ? null : (
        <details className="bh-workspace-folder-secondary">
          <summary>{t('approval.rulesTitle')}</summary>
          <div className="bh-workspace-folder-table">
            {rules
              .filter((rule) => rule.revokedAt === undefined)
              .map((rule) => (
                <div key={rule.id} className="bh-workspace-folder-row">
                  <div className="bh-workspace-folder-main">
                    <span className="bh-workspace-folder-toggle">
                      {rule.kind === 'exact'
                        ? t('approval.exactRule', { tool: rule.toolName })
                        : t('approval.allRule')}
                      {' · '}
                      {rule.role === 'assignment'
                        ? t('approval.assignment')
                        : t('approval.orchestrator')}
                    </span>
                    <button
                      type="button"
                      className="bh-workspace-folder-remove"
                      aria-label={t('approval.revokeRule')}
                      disabled={busy !== undefined}
                      onClick={() =>
                        mutate(rule.id, () => actions.revokeToolApprovalRule(botSlug, rule.id))
                      }
                    >
                      <IconCloseOutlineRegular />
                    </button>
                  </div>
                  <details className="bh-workspace-folder-secondary">
                    <summary>{t('approval.ruleDetails')}</summary>
                    <div className="bh-note">
                      {t('approval.cwd', { path: approvalRulePath(rule) })}
                    </div>
                    {rule.kind === 'exact' ? (
                      <pre className="bh-tool-approval-input">{rule.input}</pre>
                    ) : null}
                  </details>
                </div>
              ))}
          </div>
        </details>
      )}
      {browserListing === undefined ? null : (
        <FolderBrowser
          initial={browserListing}
          actions={actions}
          onCancel={() => setBrowserListing(undefined)}
          onChoose={(path) =>
            mutate('browse-folder', async () => {
              await actions.authorizeWorkspacePath(botSlug, path);
              setBrowserListing(undefined);
            })
          }
          busy={busy !== undefined}
          t={t}
        />
      )}
    </div>
  );
}
