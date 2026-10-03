import { useRef, useState, type ReactElement } from 'react';
import { Button, Input, Menu } from '@deepseek-ai/dsh-client-ui-primitives';

import type { MemoryGitGraph, MemorySnapshot, MemoryWorkingChange } from './bridge.js';
import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import {
  layoutMemoryGitLanes,
  memoryGraphLaneX,
  memoryGraphRailPath,
  MEMORY_GRAPH_LANE_WIDTH,
  MEMORY_GRAPH_NODE_Y,
  MEMORY_GRAPH_ROW_HEIGHT,
} from './memory-git-lanes.js';
import { MemoryWorkingGroups } from './memory-working-groups.js';
import { MemoryRecovery } from './memory-recovery.js';
import { useMountedResource } from './mounted-resource.js';

import { cachedMemory } from './memory-read-cache.js';
import { MemoryLoadFeedback } from './memory-load-feedback.js';

export function MemoryEntry(
  props: ChannelSidebarEntryProps & { showFiles?: boolean },
): ReactElement {
  return <MemoryEntryForScope key={cachedMemory(props.actions, props.channelId).key} {...props} />;
}

function MemoryEntryForScope({
  actions,
  channelId,
  conversationRevision,
  onMemoryCommitSelect,
  selectedMemoryCommitSha,
  onMemoryWorkingSelect,
  selectedMemoryWorking,
  t,
  refreshRevision,
  showFiles = true,
}: ChannelSidebarEntryProps & { showFiles?: boolean }): ReactElement {
  const cache = cachedMemory(actions, channelId);
  const initialPath = cache.snapshot?.files[0];
  const [refresh, setRefresh] = useState(0);
  const [branchChoice, setBranchChoice] = useState('');
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [branchFilter, setBranchFilter] = useState('');
  const skipBranchFocus = useRef(false);
  const [branchRequest, setBranchRequest] = useState<string>();
  const [snapshot, setSnapshot] = useState<MemorySnapshot | undefined>(cache.snapshot);
  const [graph, setGraph] = useState<MemoryGitGraph | undefined>(cache.graph);
  const [working, setWorking] = useState<MemoryWorkingChange[]>(cache.working ?? []);
  const [workingLoaded, setWorkingLoaded] = useState(cache.working !== undefined);
  const [workingError, setWorkingError] = useState<string | undefined>(cache.workingError);
  const [workingPending, setWorkingPending] = useState(false);
  const [graphPending, setGraphPending] = useState(false);
  const [snapshotPending, setSnapshotPending] = useState(false);
  const memoryRequestGeneration = useRef(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [path, setPath] = useState<string | undefined>(initialPath);
  const [file, setFile] = useState<
    | {
        path: string;
        body: string;
        head: string;
        binary?: boolean;
      }
    | undefined
  >(initialPath === undefined ? undefined : cache.files.get(initialPath));
  const [draft, setDraft] = useState(
    initialPath === undefined ? '' : (cache.files.get(initialPath)?.body ?? ''),
  );
  const draftState = useRef({
    path: initialPath,
    body: initialPath === undefined ? '' : (cache.files.get(initialPath)?.body ?? ''),
    value: initialPath === undefined ? '' : (cache.files.get(initialPath)?.body ?? ''),
    version: 0,
  });
  const [busy, setBusy] = useState(false);
  const [confirmRepair, setConfirmRepair] = useState(false);
  const [repairArchive, setRepairArchive] = useState<string>();
  const [error, setError] = useState<string>();
  const [snapshotError, setSnapshotError] = useState<string | undefined>(cache.snapshotError);
  const [graphError, setGraphError] = useState<string | undefined>(cache.graphError);
  const lanes = layoutMemoryGitLanes(graph?.commits ?? []);
  const branchQuery = branchFilter.trim().toLocaleLowerCase();
  const filteredBranches = (graph?.branches ?? []).filter((branch) =>
    branch.toLocaleLowerCase().includes(branchQuery),
  );
  const closeBranchMenu = (): void => {
    skipBranchFocus.current = true;
    setTimeout(() => {
      skipBranchFocus.current = false;
    }, 0);
    setBranchFilter('');
    setBranchMenuOpen(false);
  };
  const selectBranch = (branch: string): void => {
    setBranchChoice(branch);
    closeBranchMenu();
  };

  const graphMount = useMountedResource<HTMLDivElement>(() => {
    let active = true;
    const requestGeneration = memoryRequestGeneration.current;
    let graphTimer: ReturnType<typeof setTimeout> | undefined;
    let graphInFlight = false;
    setError(undefined);
    const loadGraph = (): void => {
      if (!active || requestGeneration !== memoryRequestGeneration.current || graphInFlight) return;
      if (document.visibilityState === 'hidden') {
        graphTimer = setTimeout(loadGraph, 20_000);
        return;
      }
      graphInFlight = true;
      setGraphPending(true);
      void actions
        .memoryGitGraph(channelId, 0)
        .then(
          (next) => {
            if (!active || requestGeneration !== memoryRequestGeneration.current) return;
            const current = cache.graph;
            const merged =
              current?.head === next.head &&
              current.currentBranch === next.currentBranch &&
              current.commits.length > next.commits.length
                ? { ...next, commits: current.commits, hasMore: current.hasMore }
                : next;
            cache.graph = merged;
            setGraph(merged);
            cache.graphError = undefined;
            setGraphError(undefined);
            setBranchChoice((current) =>
              next.branches.includes(current)
                ? current
                : (next.currentBranch ?? next.branches[0] ?? ''),
            );
          },
          (failure: unknown) => {
            if (active && requestGeneration === memoryRequestGeneration.current) {
              cache.graphError = failure instanceof Error ? failure.message : String(failure);
              setGraphError(cache.graphError);
            }
          },
        )
        .finally(() => {
          graphInFlight = false;
          if (active && requestGeneration === memoryRequestGeneration.current)
            setGraphPending(false);
          if (active && !showFiles) graphTimer = setTimeout(loadGraph, 20_000);
        });
    };
    if (!showFiles) {
      loadGraph();
      const onVisible = (): void => {
        if (document.visibilityState !== 'visible') return;
        clearTimeout(graphTimer);
        loadGraph();
      };
      window.addEventListener('focus', onVisible);
      document.addEventListener('visibilitychange', onVisible);
      return () => {
        active = false;
        clearTimeout(graphTimer);
        window.removeEventListener('focus', onVisible);
        document.removeEventListener('visibilitychange', onVisible);
      };
    }
    setSnapshotPending(true);
    void actions
      .memorySnapshot(channelId)
      .then((next) => {
        if (!active || requestGeneration !== memoryRequestGeneration.current) return;
        cache.snapshot = next;
        cache.snapshotError = undefined;
        setSnapshotError(undefined);
        setSnapshot(next);
        setPath((current) =>
          current !== undefined && next.files.includes(current) ? current : next.files[0],
        );
      })
      .catch((failure: unknown) => {
        if (active && requestGeneration === memoryRequestGeneration.current) {
          cache.snapshotError = failure instanceof Error ? failure.message : String(failure);
          setSnapshotError(cache.snapshotError);
        }
      })
      .finally(() => {
        if (active && requestGeneration === memoryRequestGeneration.current)
          setSnapshotPending(false);
        loadGraph();
      });
    return () => {
      active = false;
      clearTimeout(graphTimer);
    };
  }, [actions, channelId, refresh, refreshRevision, conversationRevision, showFiles]);

  const workingMount = useMountedResource<HTMLDivElement>(() => {
    if (showFiles) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    const load = (): void => {
      if (!active || inFlight) return;
      if (document.visibilityState === 'hidden') {
        timer = setTimeout(load, 15_000);
        return;
      }
      inFlight = true;
      setWorkingPending(true);
      void actions
        .memoryWorkingChanges(channelId)
        .then(
          (next) => {
            if (active) {
              cache.working = next;
              setWorking(next);
              setWorkingLoaded(true);
              cache.workingError = undefined;
              setWorkingError(undefined);
            }
          },
          (failure: unknown) => {
            if (active) {
              cache.workingError = failure instanceof Error ? failure.message : String(failure);
              setWorkingError(cache.workingError);
            }
          },
        )
        .finally(() => {
          inFlight = false;
          if (active) setWorkingPending(false);
          if (active) timer = setTimeout(load, 15_000);
        });
    };
    const onVisible = (): void => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      load();
    };
    load();
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [actions, channelId, refresh, refreshRevision, conversationRevision, showFiles]);

  const fileMount = useMountedResource<HTMLDivElement>(() => {
    let active = true;
    const requestGeneration = memoryRequestGeneration.current;
    const cachedFile = path === undefined ? undefined : cache.files.get(path);
    if (draftState.current.path !== path) {
      const body = cachedFile?.body ?? '';
      draftState.current = { path, body, value: body, version: draftState.current.version + 1 };
      setFile(cachedFile);
      setDraft(body);
    }
    const requestVersion = draftState.current.version;
    if (showFiles && path !== undefined) {
      void actions
        .memoryFile(channelId, path)
        .then((next) => {
          if (!active || requestGeneration !== memoryRequestGeneration.current) return;
          if (next !== undefined) {
            cache.files.delete(path);
            cache.files.set(path, next);
            if (cache.files.size > 20) cache.files.delete(cache.files.keys().next().value!);
          }
          setFile(next);
          const preserveDraft =
            draftState.current.version !== requestVersion ||
            draftState.current.value !== draftState.current.body;
          draftState.current.body = next?.body ?? '';
          if (!preserveDraft) {
            draftState.current.value = next?.body ?? '';
            setDraft(next?.body ?? '');
          }
        })
        .catch((failure: unknown) => {
          if (active && requestGeneration === memoryRequestGeneration.current)
            setError(failure instanceof Error ? failure.message : String(failure));
        });
    }
    return () => {
      active = false;
    };
  }, [actions, channelId, path, refresh, showFiles]);

  const loadMore = async (): Promise<void> => {
    if (graph === undefined || !graph.hasMore || loadingMore) return;
    const requestGeneration = memoryRequestGeneration.current;
    setLoadingMore(true);
    try {
      const next = await actions.memoryGitGraph(channelId, graph.commits.length);
      if (requestGeneration !== memoryRequestGeneration.current) return;
      const merged = { ...next, commits: [...graph.commits, ...next.commits] };
      cache.graph = merged;
      setGraph(merged);
    } catch (failure) {
      if (requestGeneration === memoryRequestGeneration.current)
        setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setLoadingMore(false);
    }
  };

  const requestBranchSwitch = async (): Promise<void> => {
    if (graph === undefined || branchChoice === '' || branchChoice === graph.currentBranch || busy)
      return;
    setBusy(true);
    setError(undefined);
    const target = branchChoice;
    try {
      const sent = await actions.send(
        t('memory.branchSwitchPrompt', { branch: JSON.stringify(target) }),
        undefined,
        undefined,
        target,
      );
      if (!sent) throw new Error(t('memory.branchRequestFailed'));
      setBranchRequest(target);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  const save = async (): Promise<void> => {
    if (file === undefined || file.binary || busy || draft === file.body) return;
    setBusy(true);
    setError(undefined);
    try {
      const commit = await actions.memorySave({
        channelId,
        path: file.path,
        body: draft,
        expectedHead: file.head,
        editId: crypto.randomUUID(),
      });
      memoryRequestGeneration.current += 1;
      const savedFile = { ...file, body: draft, head: commit.sha };
      cache.files.set(file.path, savedFile);
      setFile(savedFile);
      draftState.current.body = draft;
      if (snapshot !== undefined) {
        const savedSnapshot = { ...snapshot, head: commit.sha };
        cache.snapshot = savedSnapshot;
        setSnapshot(savedSnapshot);
      }
      onMemoryCommitSelect?.(commit.sha);
      setRefresh((value) => value + 1);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  const repair = async (): Promise<void> => {
    if (snapshot?.head === null || snapshot?.head === undefined || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await actions.memoryRepair({
        channelId,
        expectedHead: snapshot.head,
        repairId: crypto.randomUUID(),
      });
      memoryRequestGeneration.current += 1;
      cache.snapshot = undefined;
      cache.graph = undefined;
      cache.working = undefined;
      cache.files.clear();
      setSnapshot(undefined);
      setGraph(undefined);
      setWorking([]);
      setWorkingLoaded(false);
      setFile(undefined);
      setPath(undefined);
      setRepairArchive(result.backupPath);
      setConfirmRepair(false);
      setRefresh((value) => value + 1);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bh-memory-entry" ref={graphMount}>
      {showFiles ? (
        <div className="bh-memory-toolbar" ref={fileMount}>
          <span>{t('memory.accepted')}</span>
          <button type="button" onClick={() => setRefresh((value) => value + 1)}>
            {t('memory.refresh')}
          </button>
        </div>
      ) : null}
      {error === undefined ? null : (
        <div className="bh-error" role="alert">
          {error}
        </div>
      )}
      {showFiles ? (
        <MemoryLoadFeedback
          error={snapshotError}
          loaded={snapshot !== undefined}
          pending={snapshotPending}
          onRetry={() => setRefresh((value) => value + 1)}
          t={t}
        />
      ) : null}
      {!showFiles ? null : snapshot === undefined ? (
        snapshotError === undefined ? (
          <LoadingSkeleton kind="sidebar" label={t('memory.loading')} />
        ) : null
      ) : (
        <>
          {snapshot.provisional ? (
            <div className="bh-note" role="status">
              {t('memory.provisional')}
              {confirmRepair ? (
                <div>
                  <p>{t('memory.repairConfirm')}</p>
                  <button type="button" disabled={busy} onClick={() => void repair()}>
                    {busy ? t('memory.repairing') : t('memory.repairCommit')}
                  </button>
                  <button type="button" disabled={busy} onClick={() => setConfirmRepair(false)}>
                    {t('memory.repairCancel')}
                  </button>
                </div>
              ) : (
                <button type="button" disabled={busy} onClick={() => setConfirmRepair(true)}>
                  {t('memory.repair')}
                </button>
              )}
            </div>
          ) : null}
          {repairArchive === undefined ? null : (
            <div className="bh-note" role="status">
              {t('memory.repairDone')} {repairArchive}
            </div>
          )}
          {showFiles &&
            (snapshot.files.length === 0 ? (
              <div className="bh-note">{t('memory.empty')}</div>
            ) : (
              <div className="bh-memory-files">
                {snapshot.files.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={
                      item === path ? 'bh-memory-row bh-memory-row-selected' : 'bh-memory-row'
                    }
                    aria-pressed={item === path}
                    onClick={() => setPath(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            ))}
          {showFiles &&
            (file === undefined ? null : (
              <div className="bh-memory-editor">
                <label htmlFor="bh-memory-editor-body">{file.path}</label>
                {file.binary ? (
                  <div className="bh-note">{t('memory.binaryPreview')}</div>
                ) : (
                  <textarea
                    id="bh-memory-editor-body"
                    value={draft}
                    onChange={(event) => {
                      draftState.current.value = event.target.value;
                      draftState.current.version += 1;
                      setDraft(event.target.value);
                    }}
                    spellCheck={false}
                  />
                )}
                <button
                  type="button"
                  disabled={busy || file.binary || draft === file.body || snapshot.provisional}
                  onClick={() => void save()}
                >
                  {busy ? t('memory.saving') : t('memory.save')}
                </button>
              </div>
            ))}
        </>
      )}
      <div className="bh-memory-history" ref={workingMount}>
        <MemoryLoadFeedback
          error={graphError}
          loaded={graph !== undefined}
          pending={graphPending}
          onRetry={() => setRefresh((value) => value + 1)}
          t={t}
        />
        {graph === undefined ? (
          graphError === undefined ? (
            <LoadingSkeleton kind="sidebar" label={t('memory.loading')} />
          ) : null
        ) : (
          <>
            {!showFiles ? (
              <>
                <MemoryLoadFeedback
                  error={workingError}
                  loaded={workingLoaded}
                  pending={workingPending}
                  onRetry={() => setRefresh((value) => value + 1)}
                  t={t}
                />
                {workingLoaded ? (
                  <MemoryWorkingGroups
                    changes={working}
                    selected={selectedMemoryWorking}
                    onSelect={onMemoryWorkingSelect}
                    t={t}
                  />
                ) : workingError === undefined ? (
                  <LoadingSkeleton kind="sidebar" label={t('memory.loading')} />
                ) : null}
              </>
            ) : null}
            <div className="bh-memory-branch-control">
              <label htmlFor="bh-memory-branch-choice">{t('memory.branch')}</label>
              {graph.dirty ? (
                <span className="bh-memory-graph-dirty">{t('memory.dirty')}</span>
              ) : null}
              <Menu
                className="bh-memory-branch-picker"
                listClassName="bh-memory-branch-menu"
                open={branchMenuOpen}
                portal
                selectedId={branchChoice}
                items={filteredBranches.map((branch) => ({ id: branch, label: branch }))}
                onSelect={selectBranch}
                onClose={closeBranchMenu}
                anchor={
                  <Input
                    id="bh-memory-branch-choice"
                    type="search"
                    value={branchMenuOpen ? branchFilter : branchChoice}
                    placeholder={t('memory.searchBranch')}
                    aria-label={t('memory.searchBranch')}
                    aria-haspopup="menu"
                    aria-expanded={branchMenuOpen}
                    autoComplete="off"
                    onFocus={() => {
                      if (skipBranchFocus.current) return;
                      setBranchFilter('');
                      setBranchMenuOpen(true);
                    }}
                    onChange={(event) => {
                      setBranchFilter(event.target.value);
                      setBranchMenuOpen(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' || !branchMenuOpen) return;
                      const match = filteredBranches[0];
                      if (match === undefined) return;
                      event.preventDefault();
                      selectBranch(match);
                    }}
                  />
                }
              >
                {filteredBranches.length > 0 ? null : (
                  <div className="bh-memory-branch-empty">{t('memory.noBranches')}</div>
                )}
              </Menu>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || branchChoice === '' || branchChoice === graph.currentBranch}
                onClick={() => void requestBranchSwitch()}
              >
                {t('memory.switchBranch')}
              </Button>
            </div>
            {branchRequest === undefined || branchRequest === graph.currentBranch ? null : (
              <div className="bh-note" role="status">
                {t('memory.branchRequested')} {branchRequest}
              </div>
            )}
            <div className="bh-memory-graph-list" role="list" aria-label={t('memory.gitGraph')}>
              {graph.commits.map((commit, index) => {
                const row = lanes[index]!;
                const width = row.width * MEMORY_GRAPH_LANE_WIDTH;
                return (
                  <button
                    type="button"
                    role="listitem"
                    key={commit.sha}
                    className={
                      commit.sha === selectedMemoryCommitSha
                        ? 'bh-memory-graph-row bh-memory-row-selected'
                        : 'bh-memory-graph-row'
                    }
                    aria-pressed={commit.sha === selectedMemoryCommitSha}
                    onClick={() => onMemoryCommitSelect?.(commit.sha)}
                    title={commit.sha}
                  >
                    <svg
                      className="bh-memory-graph-svg"
                      width={width}
                      height={MEMORY_GRAPH_ROW_HEIGHT}
                      viewBox={'0 0 ' + width + ' ' + MEMORY_GRAPH_ROW_HEIGHT}
                      aria-hidden="true"
                    >
                      {row.through.map((lane) => (
                        <path
                          key={'through-' + lane}
                          data-lane={lane % 4}
                          d={
                            'M ' +
                            memoryGraphLaneX(lane) +
                            ' -0.5 V ' +
                            (MEMORY_GRAPH_ROW_HEIGHT + 0.5)
                          }
                        />
                      ))}
                      {row.fromAbove ? (
                        <path
                          data-lane={row.lane % 4}
                          d={'M ' + memoryGraphLaneX(row.lane) + ' -0.5 V ' + MEMORY_GRAPH_NODE_Y}
                        />
                      ) : null}
                      {row.joins.map((lane) => (
                        <path
                          key={'join-' + lane}
                          data-lane={lane % 4}
                          d={memoryGraphRailPath(lane, row.lane, 'incoming')}
                        />
                      ))}
                      {row.toParents.map((lane, parentIndex) => (
                        <path
                          key={'parent-' + parentIndex}
                          data-lane={lane % 4}
                          d={memoryGraphRailPath(row.lane, lane, 'outgoing')}
                        />
                      ))}
                      <circle
                        cx={memoryGraphLaneX(row.lane)}
                        cy={MEMORY_GRAPH_NODE_Y}
                        r={commit.sha === graph.head ? 4 : 3.5}
                        data-lane={row.lane % 4}
                        data-head={commit.sha === graph.head || undefined}
                      />
                    </svg>
                    <span className="bh-memory-graph-text">
                      <span className="bh-memory-graph-top">
                        <span className="bh-memory-graph-subject">{commit.subject}</span>
                        {commit.branches.map((branch) => (
                          <span
                            key={branch}
                            className="bh-memory-ref"
                            data-current={branch === graph.currentBranch || undefined}
                            title={branch}
                          >
                            {branch}
                          </span>
                        ))}
                      </span>
                      <span className="bh-memory-graph-detail">
                        <span className="bh-memory-graph-hash">{commit.sha.slice(0, 7)}</span>
                        {commit.sha === graph.head ? (
                          <span className="bh-memory-graph-head-label">HEAD</span>
                        ) : null}
                        <span
                          className={
                            'bh-memory-commit-status bh-memory-commit-status-' + commit.status
                          }
                        >
                          {commit.status === 'accepted'
                            ? t('memory.gitStatus.accepted')
                            : commit.status === 'needs-repair'
                              ? t('memory.gitStatus.needs-repair')
                              : t('memory.gitStatus.pending')}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {graph.hasMore ? (
              <button
                type="button"
                className="bh-memory-graph-more"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore ? t('memory.loading') : t('memory.loadMore')}
              </button>
            ) : null}
          </>
        )}
        {!showFiles ? (
          <MemoryRecovery
            actions={actions}
            channelId={channelId}
            refreshRevision={refreshRevision}
            t={t}
            onRestored={() => {
              memoryRequestGeneration.current += 1;
              cache.snapshot = undefined;
              cache.graph = undefined;
              cache.working = undefined;
              cache.files.clear();
              setRefresh((value) => value + 1);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
