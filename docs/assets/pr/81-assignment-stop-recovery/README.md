# #81 — Assignment stop and restart acceptance

Verified on a real isolated DSH 0.2.0-rc.1 Host with DeepSeek Flash / low. The existing production stop/recovery path passed; this PR adds a reproducible acceptance script, bilingual guide and evidence, with no production runtime or UI change.

## Actual run

1. [Pending proof](01-pending-proof.json): an Orchestrator creates one owned `workspace-write` Assignment with the selected Grant and Continuity Key; the real native `pwsh` timer awaits Human approval.
2. [Stopped proof](02-stopped-proof.json) and [native stop proof](native-stop-proof.json): actual `stop_assignment` succeeds; the pending Shell has no successful result, approval expires, the key is released, permission facts remain and Bot returns to idle.
3. [Restart proof](03-restart-proof.json): restart the same isolated Host; old stopped state, permission snapshot, expired approval and Channel history survive. The same Grant/key creates a new Session, whose real Report reaches the Orchestrator and becomes `RESTART_REUSE_DONE` in the DM.

| Phase                        | Light                                    | Dark                                    |
| ---------------------------- | ---------------------------------------- | --------------------------------------- |
| Awaiting approval            | [Screenshot](pending-overview-light.png) | [Screenshot](pending-overview-dark.png) |
| After actual stop            | [Screenshot](stop-overview-light.png)    | [Screenshot](stop-overview-dark.png)    |
| After restart and fresh work | [Screenshot](restart-overview-light.png) | [Screenshot](restart-overview-dark.png) |

Screenshots show the actual Activity Center Overview, with Show idle Bots enabled. The pending view contains one active Session and one action; the stopped/restarted views contain no running Session and zero actions. Raw approval arguments and local working-directory paths are outside this view. No page content or application state was mocked or rewritten for capture.

The initial script incorrectly assumed native `bash` on Windows and subsequently misread the public Activity response as a nested snapshot. Both script errors were fixed against the actual public contracts. The prepared scene was retained, and all pending/stop assertions, native proof and captures subsequently passed. The complete restart phase passed. These were validation-script defects, not production fixes.

## Reproduce and scope

Follow the [verified guide](../../../dev/guides/assignment-stop-recovery.md). Run `prepare`, `stop`, restart the exact isolated Host, then run `restart`. `pending` resumes verification of the prepared pending scene; `capture` recaptures without model requests.

All public records exclude credentials, raw Session snapshots, private tool arguments/results and machine paths. #81 remains open for its complete foundation acceptance matrix; this run does not claim injected stop failure, crash-window reconciliation, danger-full-access or cross-Bot concurrency coverage.
