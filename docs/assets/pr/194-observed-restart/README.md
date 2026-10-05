# Observed Assignment Report interrupted by a Host crash

Refs #194. Production baseline: `58de22c1228b00691f388edfd875e5f0859b44c8`.
Real isolated DSH 0.2.0-rc.1 and DeepSeek-V41-Flash, low reasoning effort, on 2026-10-05.
No production Runtime, UI, schema, permission or policy change was required.

## What actually ran

1. The real Orchestrator created one owned Assignment through `create_assignment`.
   Its one native Turn successfully called `report_to_orchestrator` with progress
   `OBSERVED_REPORT: Research remains available.` and ended. Under conditional wake,
   the Report remained pending; no automatic Turn consumed it (`01-pending.json`).
2. A real Human DM triggered the second Orchestrator Turn. Its native `user/message`
   contained the exact Report Source Event, not merely the marker quoted in the first
   Human task. It sent `OBSERVED_READ`, then requested the native `bash` tool with
   `command: "sleep 1"`. Human approval was held. The Report was Processing, observed
   and unhandled; only the first Orchestrator Turn had ended (`02-processing.json`).
   The timer was never approved or executed.
3. After checking the launcher's exact PID, command line and listening port, the
   operator killed only that isolated QA Host with SIGKILL, then relaunched the same
   Profile. No database rows or Session records were edited. DSH closed native Turn 2
   as `interrupted`; BotHarness retained the same Report as Needs repair. The approval
   expired. Both Orchestrator Turn starts and Report exposures stayed unchanged; the
   Assignment still had one completed Turn (`03-restarted.json`).
4. Through the actual Client, the operator clicked the Needs repair Report, opened its
   native Assignment, selected Trajectory and returned to the Bot Channel. The Report
   Source Event, Session, summary, author, native Assignment Turn and observation time
   remained unchanged and unhandled. No new execution or Report exposure occurred
   (`04-source-view.json`). The scene remains available for Human QA.

`reportExposures` counts only native input containing the exact `reported [Source Event …]`
line. It excludes the initial Human instruction containing the same summary text.
A second `turn/end` after reboot closes the interrupted Turn; it is not a replay and
is never treated as successful completion.

## Screenshots

Actual Client captures through CUA, default 1280 × 720 viewport, English, light theme.
Processing and repair are direct 320 × 650 Inbox-panel screenshot clips from that viewport;
the native Trajectory is a full 1280 × 720 capture. Cropping excludes the native approval
card's machine-local working directory. The screenshots and all four proofs come from
one fresh repeated run (Bot **Observed restart QA 1791184379688**); no scenes are mixed.
These show successive functional states, not a UI redesign comparison.

- `processing.jpg`: Human trigger and actual Assignment Report Processing.
- `restarted.jpg`: the same Human trigger and Report Needs repair after restart.
  Approval expiry is verified separately through the authenticated endpoint.
- `source-trajectory.jpg`: native Assignment with one Turn and the successful Report call.

Only synthetic QA content and bounded authenticated-query/native-history proofs are
published. Login URLs, cookies, raw model/context logs and private state files stay local.

## Reproduce

Use a new isolated QA Profile and the worktree's pinned CLI through `scripts/dev-instance.mjs`.
Keep its private launch summary outside Git. Set `BH_E2E_ORIGIN` to that localhost origin,
`BH_E2E_HOME` to the isolated DSH home and `BH_E2E_EVIDENCE` to a private output directory.

```sh
node scripts/e2e-assignment-observed-restart.mjs prepare
node scripts/e2e-assignment-observed-restart.mjs observe
```

Open the launcher's private login URL, select the QA Bot, and expand Bot Inbox. Do not
approve the timer. Capture Processing. Verify that the PID belongs to this isolated
Host, kill only that PID with SIGKILL, and restart the same home and port with the helper.

```sh
node scripts/e2e-assignment-observed-restart.mjs restart
```

Reauthenticate using the new private launch URL. Capture Needs repair, click the Report,
inspect the native Assignment Trajectory, then return to the Bot Channel.

```sh
node scripts/e2e-assignment-observed-restart.mjs verify
```

The driver is opt-in backend acceptance; it never performs UI automation, approves tools
or terminates processes. `observe` can be rerun read-only once its approval ID is saved.
A later Human message is new work and falls outside the driver's fixed two-Turn baseline.

## Coverage and bounds

The automated collaboration regression exercises real Runtime report admission and a
Channel side effect before adapter failure, then reopens persistence and consumes a later
weaker progress Report. It asserts the original Needs repair item remains intact and is
excluded from the new successful harvest. It does not mutate database rows to fabricate
repair. The real E2E above separately proves crash recovery after actual native exposure.

This slice accepts observed Orchestrator interruption only. Active Assignment crash,
explicit cancellation, failed terminal Report/Host notice pairing, and generic typed repair
remain separate. It does not claim all of #194 complete.
