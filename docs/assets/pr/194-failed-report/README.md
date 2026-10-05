# Failed semantic Report acceptance — #194

Baseline: `2c767e30dcfbccc5ec78c3939b66327ed477e401`, pinned DSH `0.2.0-rc.1`, real DeepSeek Flash / low.

This slice verifies existing behavior, with no production, UI or schema changes. A semantic `failed` Report means the task did not produce its required result. A DSH native Turn ending normally means the executor finished its response; it does not make that failed task successful.

## Real sequence and evidence

1. A fresh Bot creates exactly one Assignment for an explicitly synthetic scenario with unavailable input. The Assignment actually calls `report_to_orchestrator` once with `state: failed`, the unique `FAILED_RESULT` summary and `expects_reply: false`, then ends its native Turn normally. It runs no Shell/file/Subagent tools.
2. The owning Orchestrator receives and handles that exact source once, emits `FAILED_REPORT_SEEN` once, and does not retry or create replacement work. There is one Bot-authored Assignment Report and no successful Host completion Notice, even though the Assignment's native `turn/end` reason is `completed`.
3. After verifying the isolated Host's launch PID and listening port, stop only that Host and cold-start the same Profile. Report identity, summary, author, Turn, Session, observation and handling timestamps remain exact. The Assignment remains idle with latest Report failed; no new Turn or Source Event appears.
4. In Bot Inbox, expand the Assignment group and **Handled or ignored · 1**, then click the **Failed / Handled** Report. The original native Assignment opens with the actual failed Report arguments and its successful delivery receipt. Return to the Channel: all source and execution counts remain unchanged.

The three JSON proofs are from that one actual run. `01-settled.json`, `02-restarted.json` and `03-source-view.json` are exactly equal: one native Assignment Turn, two Orchestrator Turns (creation plus failure harvest), one source exposure, one Assignment and zero successful Host Notices. Only an explicit allowlist of non-secret source/native fields is published; credentials, auth URLs, raw model logs and local filesystem paths are excluded.

All three PNGs are real CUA captures at the unchanged 1280 × 720 viewport, same Bot, locale and theme. `01-settled.png` and `02-restarted.png` show the same failed source before/after cold restart. `03-source-view.png` shows the original failed Report and its delivery result. These are acceptance states of an unchanged UI, not a code before/after layout comparison.

## Regression and reproduction

The collaboration regression creates a real SQLite-backed Runtime Assignment, emits a failed Report, handles it once, then invokes successful native-completion confirmation twice for the same Turn. Neither confirmation fabricates or pairs a successful Host Notice. Cold restart preserves the exact failure source and no automatic work starts. A later explicit Human message does not re-harvest that handled source or create another Assignment.

For a fresh real run, use `scripts/dev-instance.mjs` with a new isolated Profile, authenticate locally, and set private local environment variables:

```text
BH_E2E_ORIGIN=<isolated localhost origin>
BH_E2E_HOME=<isolated Profile home>
BH_E2E_EVIDENCE=<private evidence directory>
BH_E2E_STATE=<private scene JSON path>
```

Run `node scripts/e2e-assignment-failed-report.mjs prepare`; capture the Channel's expanded failed Report. Verify the exact task-owned Host PID, stop only that process, restart the same Profile and refresh local authentication, then run the driver with `restart`. Open the Report in the UI and inspect its original Assignment; return and run `verify`. The driver never terminates a process, approves tools or edits database rows.

Human QA Bot: **Failed result QA 1791189795244**. The retained Profile opens its DM with Bot Inbox expanded. **Failed** describes the authored task result; **Handled** describes Orchestrator consumption, and **Idle** describes native execution. They intentionally answer different questions.

This verifies negative pairing of a failed semantic Report with normal native settlement. Native execution-error/interruption Notices, cancellation, remaining Needs repair severity protection and full #194 closure are not claimed by this slice.
