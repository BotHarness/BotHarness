# Needs repair survives weaker progress — #194

Baseline/current production: `9b74f7b7991ca31da2a7b65540f96e08539c01ca`. No production change was needed.

One selected PersonaBot, one Assignment, actual DSH 0.2.0-rc.1 and official DeepSeek Flash / low. `model-routes.json` verifies the actual committed native request headers for both Assignment and Orchestrator, rather than only the saved preset. Every evidence file below belongs to the same successful run.

1. `01-pending.json`: Assignment reports progress and ends; one immutable Pending Report.
2. `02-processing.json`: a Human message makes the Orchestrator observe that exact Report, emit `OBSERVED_READ`, then wait on **ungranted** native Shell approval (`sleep 1`). No Shell execution is approved.
3. The exact task-owned Host PID is verified and killed during that live Turn, then cold-launched with the same Profile. `03-restarted.json`: original Report becomes Needs repair, original observation/source identity remains; DSH closes the orphaned Orchestrator Turn as `interrupted`, approval expires, Assignment stays idle without replay.
4. An explicit Human request resumes only the original Assignment to emit a different informational progress Report. `04-weaker-pending.json`: new Report is Pending, original repair remains exactly unchanged.
5. A later Human message harvests only new information. `05-weaker-handled.json`: new progress becomes Handled, original Needs repair stays unchanged and has entered the Orchestrator context only once. Assignment has two normally completed Turns, both caused by explicit requests; no replacement, automatic replay or successful completion Notice.
6. Stop only that verified Host, cold-launch the same Profile again. `06-weaker-restarted.json` is exactly equal to `05-weaker-handled.json`; both source facts persist independently.

## Reproduce

Launch an isolated Profile with the worktree-pinned helper: `node scripts/dev-instance.mjs --home <isolated-home> --port <free-port> --worktree <worktree> --build --json`. Keep the private login URL and local artifacts private. Set `BH_E2E_ORIGIN`, `BH_E2E_HOME`, `BH_E2E_EVIDENCE`, `BH_E2E_STATE` and `BH_E2E_REPAIR_SCENARIO=1`.

Run `node scripts/e2e-assignment-observed-restart.mjs prepare`, then `observe`. Verify the exact owned Host PID/home/port; interrupt it while its Orchestrator approval is pending, cold-launch the same Profile, then run the same script with `restart`. Run `node scripts/e2e-assignment-repair-severity.mjs weaker`. Restart the exact Host again and run this second script with `restart`. Do not approve Shell or introduce unrelated messages during the run. Private state checkpoints are not canonical product authority; all assertions read the actual public RPC and native Session snapshots.

The first setup attempt failed because the model shortened the Assignment purpose and did not receive its Report instructions; it requested extra tools which were not approved or executed. That separate isolated attempt was cancelled and retained locally. The revised setup sends the complete Assignment input verbatim and distinguishes Assignment and Orchestrator roles. Failed-attempt facts are not mixed into these proofs.

## Visual acceptance blocked

The browser tool explicitly refused the local page under its security policy and prohibited alternate-surface workarounds. None were attempted. **No UI screenshots or actual source navigation are claimed. This new PR stays Draft pending those checks and Human QA; #194 remains open.**

When browser access is restored, open the successful **Observed restart QA** Bot → details → Inbox. Compare the original Needs repair item with the newer Handled progress item; use the Needs repair and Handled filters, open each exact source, and verify their original native Assignment Turns. Capture actual matching before/after screens, then run the second script with `verify` only after that real navigation. `sourceAvailable: true` proves query availability, not that a Human clicked through the UI.
