# Active Assignment crash acceptance — #194

Baseline: `c5a5571dd234e5c97513c06a26e2d64b88e294da`, DSH `0.2.0-rc.1`, real DeepSeek Flash / low.

This is acceptance coverage of existing behavior, with no production or UI changes. It complements #849: that slice interrupts an Orchestrator after observation; this slice interrupts the Assignment while its progress Report is still pending.

## Observed sequence

1. A fresh PersonaBot creates one native Assignment Session. The Assignment successfully calls `report_to_orchestrator` once with the unique progress marker, then waits for approval of an inert `sleep 1` command. Its native Turn has started but has not ended. The creating Orchestrator has ended.
2. Kill only the task-owned isolated Host after verifying its launch PID and listening port. No tool approval is granted, no database rows are edited, and no Report is injected.
3. Restart the same isolated Profile. The Assignment becomes `error` (Sessions displays **Needs attention**); its continuity key is released. Its native Session ends as `interrupted`, and the old approval expires.
4. The original Source Event remains **Pending**, with the exact ID, time, Report state, author, Turn and Assignment Session reference. No new Report or completion notice is fabricated; neither Session gets another Turn automatically.
5. Click the Pending Report in Bot Inbox. The original Assignment opens and shows the successful progress Report and interrupted Shell call. Return to the Channel; the source identity and Pending state remain unchanged.

The progress Report records a fact delivered before the crash. It stays Pending because the Orchestrator has not observed it; Assignment execution failure is a separate fact. This slice does not assert that the progress Report must become Needs repair, nor that opening it handles it.

## Evidence

- `01-active.png` and `02-restarted.png`: identical 320 × 650 Channel-sidebar crops within the real 1280 × 720 viewport; Running → Needs attention, same Pending Report.
- `03-source-view.png`: full real viewport showing the original Report tool result and interrupted Shell call.
- `01-active.json`, `02-restarted.json`, `03-source-view.json`: bounded allowlisted RPC / native Session snapshots and assertions, captured from that same run. Credentials, local filesystem paths and raw model logs are excluded.

## Regression and reproduction

`packages/core/test/assignment-collaboration.test.ts` snapshots an actually running SQLite-backed Assignment through SQLite backup, then mounts a fresh runtime from that snapshot. It asserts exact Report preservation, no automatic Assignment/Orchestrator execution, failed-session resume refusal, and one-slot capacity plus continuity-key release through explicit creation of replacement work. The test does not seed a fake working row.

For another real run, start a new isolated Profile with `scripts/dev-instance.mjs`, authenticate locally, and set these private local environment variables:

```text
BH_E2E_ORIGIN=<isolated localhost origin>
BH_E2E_HOME=<isolated Profile home>
BH_E2E_EVIDENCE=<private evidence directory>
BH_E2E_STATE=<private scene JSON path>
```

Run `node scripts/e2e-assignment-active-crash.mjs prepare`; capture the Channel Sessions + Bot Inbox UI. Verify the exact isolated Host PID before terminating that PID. Restart the same Profile and refresh its local authentication cookie, then run the driver with `restart`. Click the Report and inspect its original native Session using the UI, return to the Channel, and run `verify`. The driver never kills a process or approves a tool.

Human QA can inspect the retained isolated Profile: the Bot named **Active crash QA 1791188011559**, the expired approval in its DM, Sessions → Needs attention, and its one Pending progress Report. Source navigation should reopen the original Assignment; no new work should start merely from opening it.

Failed terminal Report / Host-notice pairing, cancellation, and remaining Needs repair severity protection stay outside this slice; #194 remains open.
