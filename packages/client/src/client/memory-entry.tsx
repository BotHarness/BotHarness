import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Button, Input, Menu } from '@deepseek-ai/dsh-client-ui-primitives';

import type { MemoryGitGraph, MemorySnapshot } from './bridge.js';
import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import {
  layoutMemoryGitLanes,
  memoryGraphLaneX,
  memoryGraphRailPath,
  MEMORY_GRAPH_LANE_WIDTH,
  MEMORY_GRAPH_NODE_Y,
  MEMORY_GRAPH_ROW_HEIGHT,
} from './memory-git-lanes.js';

export function MemoryEntry({
  actions,
  channelId,
  conversationRevision,
  onMemoryCommitSelect,
  selectedMemoryCommitSha,
  t,
}: ChannelSidebarEntryProps): ReactElement {
  const [refresh, setRefresh] = useState(0);
  const [branchChoice, setBranchChoice] = useState('');
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [branchFilter, setBranchFilter] = useState('');
  const skipBranchFocus = useRef(false);
  const [branchRequest, setBranchRequest] = useState<string>();
  const [snapshot, setSnapshot] = useState<MemorySnapshot>();
  const [graph, setGraph] = useState<MemoryGitGraph>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [path, setPath] = useState<string>();
  const [file, setFile] = useState<{ path: string; body: string; head: string }>();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmRepair, setConfirmRepair] = useState(false);
  const [repairArchive, setRepairArchive] = useState<string>();
  const [error, setError] = useState<string>();
  const [snapshotError, setSnapshotError] = useState<string>();
  const [graphError, setGraphError] = useState<string>();
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

  useEffect(() => {
    let active = true;
    setError(undefined);
    setSnapshotError(undefined);
    setGraphError(undefined);
    setSnapshot(undefined);
    setGraph(undefined);
    void actions
      .memorySnapshot(channelId)
      .then((next) => {
        if (!active) return;
        setSnapshot(next);
        setPath((current) =>
          current !== undefined && next.files.includes(current) ? current : next.files[0],
        );
      })
      .catch((failure: unknown) => {
        if (active) setSnapshotError(failure instanceof Error ? failure.message : String(failure));
      })
      .finally(() => {
        // Snapshot may bootstrap the seed acceptance fact. On a side branch it
        // rejects, but the raw graph remains independently readable.
        if (!active) return;
        void actions
          .memoryGitGraph(channelId, 0)
          .then((next) => {
            if (active) {
              setGraph(next);
              setBranchChoice((current) =>
                next.branches.includes(current)
                  ? current
                  : (next.currentBranch ?? next.branches[0] ?? ''),
              );
            }
          })
          .catch((failure: unknown) => {
            if (active) setGraphError(failure instanceof Error ? failure.message : String(failure));
          });
      });
    return () => {
      active = false;
    };
  }, [actions, channelId, refresh, conversationRevision]);

  useEffect(() => {
    let active = true;
    setFile(undefined);
    setDraft('');
    if (path !== undefined) {
      void actions
        .memoryFile(channelId, path)
        .then((next) => {
          if (!active) return;
          setFile(next);
          setDraft(next?.body ?? '');
        })
        .catch((failure: unknown) => {
          if (active) setError(failure instanceof Error ? failure.message : String(failure));
        });
    }
    return () => {
      active = false;
    };
  }, [actions, channelId, path, refresh]);

  const loadMore = async (): Promise<void> => {
    if (graph === undefined || !graph.hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await actions.memoryGitGraph(channelId, graph.commits.length);
      setGraph({ ...next, commits: [...graph.commits, ...next.commits] });
    } catch (failure) {
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
    if (file === undefined || busy || draft === file.body) return;
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
    <div className="bh-memory-entry">
      <div className="bh-memory-toolbar">
        <span>{t('memory.accepted')}</span>
        <button type="button" onClick={() => setRefresh((value) => value + 1)}>
          {t('memory.refresh')}
        </button>
      </div>
      {error === undefined ? null : (
        <div className="bh-error" role="alert">
          {error}
        </div>
      )}
      {snapshot === undefined ? (
        snapshotError === undefined ? (
          <div className="bh-note">{t('memory.loading')}</div>
        ) : (
          <div className="bh-error" role="alert">
            {snapshotError}
          </div>
        )
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
          {snapshot.files.length === 0 ? (
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
          )}
          {file === undefined ? null : (
            <div className="bh-memory-editor">
              <label htmlFor="bh-memory-editor-body">{file.path}</label>
              <textarea
                id="bh-memory-editor-body"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                spellCheck={false}
              />
              <button
                type="button"
                disabled={busy || draft === file.body || snapshot.provisional}
                onClick={() => void save()}
              >
                {busy ? t('memory.saving') : t('memory.save')}
              </button>
            </div>
          )}
        </>
      )}
      <div className="bh-memory-history">
        <div className="bh-memory-graph-heading">
          <strong>{t('memory.gitGraph')}</strong>
          {graph === undefined ? null : (
            <span className="bh-memory-graph-count">
              {graph.commits.length}
              {graph.hasMore ? '+' : ''}
            </span>
          )}
        </div>
        {graph === undefined ? (
          graphError === undefined ? (
            <div className="bh-note">{t('memory.loading')}</div>
          ) : (
            <div className="bh-error" role="alert">
              {graphError}
            </div>
          )
        ) : (
          <>
            <div className="bh-memory-graph-meta">
              <span className="bh-memory-graph-branch">
                {graph.currentBranch === null ? t('memory.detached') : graph.currentBranch}
              </span>
              {graph.dirty ? (
                <span className="bh-memory-graph-dirty"> · {t('memory.dirty')}</span>
              ) : null}
            </div>
            <div className="bh-memory-branch-control">
              <label htmlFor="bh-memory-branch-choice">{t('memory.branch')}</label>
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
      </div>
    </div>
  );
}
