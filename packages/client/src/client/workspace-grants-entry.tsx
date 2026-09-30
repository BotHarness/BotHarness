import {
  useCallback,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react';
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
import { MemoryFileActionButton } from './memory-file-actions.js';
import { Modal } from './modal.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import { useMountedResource } from './mounted-resource.js';
import {
  publishWorkspaceGrantChange,
  subscribeWorkspaceGrantChanges,
  workspaceGrantRevision,
} from './workspace-grant-events.js';

export { WORKSPACE_GRANTS_CHANGED } from './workspace-grant-events.js';

type WorkspaceCache = {
  grants: WorkspaceGrantView[];
  workspaces: WorkspaceOption[];
  rules: ToolApprovalRuleView[];
  access: AssignmentAccessPresetView | undefined;
  memoryDir: string | undefined;
};
const workspaceCaches = new WeakMap<
  ChannelSidebarEntryProps['actions'],
  Map<string, WorkspaceCache>
>();

function cachedWorkspace(
  actions: ChannelSidebarEntryProps['actions'],
  botSlug: string | undefined,
): WorkspaceCache | undefined {
  return botSlug === undefined ? undefined : workspaceCaches.get(actions)?.get(botSlug);
}

function rememberWorkspace(
  actions: ChannelSidebarEntryProps['actions'],
  botSlug: string,
  patch: Partial<WorkspaceCache>,
): void {
  let cache = workspaceCaches.get(actions);
  if (cache === undefined) {
    cache = new Map();
    workspaceCaches.set(actions, cache);
  }
  const previous = cache.get(botSlug);
  cache.delete(botSlug);
  cache.set(botSlug, {
    grants: [],
    workspaces: [],
    rules: [],
    access: undefined,
    memoryDir: undefined,
    ...previous,
    ...patch,
  });
  if (cache.size > 30) cache.delete(cache.keys().next().value!);
}

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
  } catch {}
  return rule.scopeKey;
}

function FolderRow({
  name,
  path,
  remove,
  removeLabel,
  disabled,
  detail,
  pathAction,
}: {
  name: string;
  path: string;
  remove?: () => void;
  removeLabel?: string;
  disabled?: boolean;
  detail?: ReactNode;
  pathAction?: ReactNode;
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
          {pathAction ?? (
            <div className="bh-workspace-folder-path" title={path}>
              {path}
            </div>
          )}
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

  const abortOnUnmount = useMountedResource<HTMLDivElement>(
    () => () => request.current?.abort(),
    [],
  );

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
      <div
        className="bh-folder-browser-crumbs"
        aria-label={t('grant.browseLocation')}
        ref={abortOnUnmount}
      >
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
      {loading ? <LoadingSkeleton kind="sidebar" label={t('grant.loading')} /> : null}
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

export function WorkspaceGrantsEntry({
  botSlug,
  actions,
  t,
  developerMode = false,
}: ChannelSidebarEntryProps & { developerMode?: boolean }): ReactElement {
  const slug = botSlug ?? '';
  const subscribeChanges = useCallback(
    (listener: () => void) => subscribeWorkspaceGrantChanges(slug, listener),
    [slug],
  );
  const getChangeRevision = useCallback(() => workspaceGrantRevision(slug), [slug]);
  const changeRevision = useSyncExternalStore(
    subscribeChanges,
    getChangeRevision,
    getChangeRevision,
  );
  const cached = cachedWorkspace(actions, botSlug);
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>(cached?.workspaces ?? []);
  const [grants, setGrants] = useState<WorkspaceGrantView[]>(cached?.grants ?? []);
  const [rules, setRules] = useState<ToolApprovalRuleView[]>(cached?.rules ?? []);
  const [access, setAccess] = useState<AssignmentAccessPresetView | undefined>(cached?.access);
  const [confirmDanger, setConfirmDanger] = useState(false);
  const [memoryDir, setMemoryDir] = useState<string | undefined>(cached?.memoryDir);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualPath, setManualPath] = useState('');
  const [browserListing, setBrowserListing] = useState<HostDirectoryListing | undefined>();
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(cached === undefined);
  const activeSlug = useRef<string | undefined>(undefined);
  const requestVersion = useRef(0);
  const showGrant = (grant: WorkspaceGrantView): void => {
    if (botSlug === undefined || activeSlug.current !== botSlug) return;
    const current = cachedWorkspace(actions, botSlug)?.grants ?? grants;
    const next = [...current.filter((row) => row.id !== grant.id), grant];
    rememberWorkspace(actions, botSlug, { grants: next });
    setGrants(next);
  };

  const refresh = async (slug: string): Promise<void> => {
    if (activeSlug.current !== slug) return;
    const version = ++requestVersion.current;
    const isCurrent = (): boolean =>
      activeSlug.current === slug && requestVersion.current === version;
    try {
      const owned = await withWorkspaceActionDeadline(
        actions.listWorkspaceGrants(slug),
        t('grant.loadTimeout'),
      );
      if (!isCurrent()) return;
      rememberWorkspace(actions, slug, { grants: owned });
      setGrants(owned);
      setLoading(false);
      const [available, memory, ruleRows, preset] = await Promise.all([
        actions.listWorkspaceOptions(),
        actions.memoryDirectory(slug),
        actions.listToolApprovalRules(slug),
        actions.assignmentAccess(slug),
      ]);
      if (!isCurrent()) return;
      rememberWorkspace(actions, slug, {
        workspaces: available,
        memoryDir: memory,
        rules: ruleRows,
        access: preset,
      });
      setWorkspaces(available);
      setMemoryDir(memory);
      setRules(ruleRows);
      setAccess(preset);
    } catch (cause) {
      if (isCurrent()) throw cause;
    }
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    activeSlug.current = botSlug;
    requestVersion.current += 1;
    const current = cachedWorkspace(actions, botSlug);
    setWorkspaces(current?.workspaces ?? []);
    setGrants(current?.grants ?? []);
    setRules(current?.rules ?? []);
    setAccess(current?.access);
    setMemoryDir(current?.memoryDir);
    setBrowserListing(undefined);
    setBusy(undefined);
    setConfirmDanger(false);
    if (botSlug === undefined) return;
    setLoading(cachedWorkspace(actions, botSlug) === undefined);
    setError(undefined);
    void refresh(botSlug).catch((cause: unknown) => {
      if (activeSlug.current !== botSlug) return;
      setError(errorMessage(cause));
      setLoading(false);
    });
    return () => {
      activeSlug.current = undefined;
      requestVersion.current += 1;
    };
  }, [actions, botSlug, changeRevision]);
  const mutate = (id: string, action: () => Promise<unknown>): void => {
    if (botSlug === undefined || busy !== undefined) return;
    setBusy(id);
    setError(undefined);
    void (async () => {
      try {
        const operation = action().then((value) => {
          publishWorkspaceGrantChange(botSlug);
          return value;
        });
        await withWorkspaceActionDeadline(operation, t('grant.operationTimeout'));
      } catch (cause) {
        if (activeSlug.current === botSlug) setError(errorMessage(cause));
      } finally {
        if (activeSlug.current === botSlug) setBusy(undefined);
      }
    })();
  };

  const openFolderBrowser = (): void => {
    if (botSlug === undefined || busy !== undefined) return;
    setBusy('folder-picker');
    setError(undefined);
    void (async () => {
      try {
        const listing = await actions.listHostFolders();
        if (activeSlug.current !== botSlug) return;
        setBrowserListing(listing);
      } catch (cause) {
        if (activeSlug.current !== botSlug) return;
        if (pickerUnavailable(cause)) {
          try {
            const grant = await actions.addWorkspaceFolder(botSlug);
            if (grant !== undefined) showGrant(grant);
            await refresh(botSlug);
          } catch (nativeCause) {
            if (activeSlug.current === botSlug) setError(errorMessage(nativeCause));
          }
        } else {
          setError(errorMessage(cause));
        }
      } finally {
        if (activeSlug.current === botSlug) setBusy(undefined);
      }
    })();
  };

  if (botSlug === undefined) return <div className="bh-note">{t('grant.noBot')}</div>;
  const active = grants.filter((grant) => grant.revokedAt === undefined);
  const revoked = grants.filter((grant) => grant.revokedAt !== undefined);
  const activeIds = new Set(active.map((grant) => grant.workspaceId));
  const available = workspaces.filter((workspace) => !activeIds.has(workspace.id));

  return (
    <div className="bh-workspace-grants" ref={mount}>
      {developerMode ? <div className="bh-note">{t('grant.safeDefault')}</div> : null}
      {loading && grants.length === 0 ? (
        <LoadingSkeleton kind="sidebar" label={t('grant.loading')} />
      ) : null}
      {error === undefined ? null : (
        <div className="bh-error" role="alert">
          {error}
        </div>
      )}
      <div className="bh-workspace-folder-table">
        <FolderRow
          name={t('grant.memory')}
          path={memoryDir ?? ''}
          pathAction={
            memoryDir === undefined ? undefined : (
              <MemoryFileActionButton
                actions={actions}
                slug={botSlug}
                path=""
                text={memoryDir}
                className="bh-workspace-folder-path"
                t={t}
              />
            )
          }
        />
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
                const current = cachedWorkspace(actions, botSlug)?.grants ?? grants;
                const next = current.map((row) =>
                  row.id === revokedGrant.id ? revokedGrant : row,
                );
                rememberWorkspace(actions, botSlug, { grants: next });
                if (activeSlug.current === botSlug) setGrants(next);
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
                  showGrant(await actions.authorizeWorkspacePath(botSlug, manualPath.trim()));
                  if (activeSlug.current === botSlug) {
                    setManualPath('');
                    setManualOpen(false);
                  }
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
                      mutate(workspace.id, async () =>
                        showGrant(await actions.createWorkspaceGrant(botSlug, workspace.id)),
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
                  if (activeSlug.current === botSlug) setConfirmDanger(false);
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
              showGrant(await actions.authorizeWorkspacePath(botSlug, path));
              if (activeSlug.current === botSlug) setBrowserListing(undefined);
            })
          }
          busy={busy !== undefined}
          t={t}
        />
      )}
    </div>
  );
}
