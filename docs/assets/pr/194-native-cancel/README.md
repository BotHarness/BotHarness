# Native Human cancellation — #194

Baseline: `4321fdb8807e69958754748f7dd92818c0e519ea`. Fixed proof: this branch.

Two isolated DSH 0.2.0-rc.1 Profiles, real official DeepSeek Flash / low, one Assignment each. Each Assignment emits one progress Report, then awaits an **ungranted** native Shell approval (`sleep 1`). Cancellation was performed through the official native `session/cancel` RPC (`request.sessionId`), not by a claimed UI click. The Shell never succeeds. No SQL mutation or synthetic Turn/Report is used.

- `00-baseline.json`: native Turn ends `aborted/user`; progress remains Pending, no lifecycle notice, no cancellation acknowledgement, one Orchestrator Turn.
- `01-cancelled.json`: the fixed run retains the original Report, creates one System cancellation Source Event with the native Turn/end sequence, harvests both once, expires approval, releases continuity key, and does not retry/replace the Assignment.
- `02-restarted.json`: the same fixed Profile after stopping its exact Host PID and cold restart; proof is exactly equal to `01-cancelled.json`. Baseline is a separate run with distinct IDs.

## Capture blocker / remaining acceptance

The in-app browser repeatedly rejects loading the new local baseline instance with `net::ERR_BLOCKED_BY_CLIENT`; its tab stays `about:blank`. The Host API and real model run work. Browser troubleshooting, one reset, and the app browser-open surface did not resolve it. User assistance to open the local page is pending. **No before/after screenshots, UI cancellation-button click, or actual Human source-navigation acceptance are claimed. This PR remains Draft until those requirements are met.** Existing screenshots from other slices are not reused.

## Runnable verification path

Launch this worktree with `node scripts/dev-instance.mjs --home <isolated-home> --port <free-port> --worktree <worktree> --build --json` using its pinned CLI and private login URL. Set `BH_E2E_ORIGIN`, `BH_E2E_HOME`, `BH_E2E_EVIDENCE`, `BH_E2E_STATE` to that isolated instance and run `node scripts/e2e-assignment-native-cancel.mjs prepare`. Open **Native cancellation QA → DM → Human cancellation acceptance**; cancel the live Assignment through native Session control while its Shell approval is pending. Run phase `cancelled`. In Bot details → Inbox verify the original progress Report and System cancellation notice are Handled; the DM contains one `CANCEL_NOTICE_SEEN`. Open the Report/notice source and inspect the native aborted Turn. Cold restart the same Profile and run phase `restart`; only after actual UI source navigation run phase `verify`. Keep viewport/theme/locale matched for baseline/fixed screenshots. Never approve the Shell or request new work during this run.

Public JSON uses an allowlist; private authentication, logs, profile paths and scene files are not included.
