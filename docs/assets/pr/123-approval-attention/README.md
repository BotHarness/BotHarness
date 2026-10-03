# Native Tool approval attention — #123

Real isolated DSH 0.2.0-rc.1 with actual DeepSeek V4 Pro/off, Node 24.21.0.

1. Open Bot mode and `Approval attention QA`.
2. Two owned native Sessions request one browser list and one harmless two-second Node timer. Sidebar, composer and Overview show approval count 2 independently of Orchestrator execution; safe Session rows remain visible.
3. Reload: execution and count are unchanged; the composer disclosure starts closed.
4. Approve browser list once: one approval remains and the Assignment becomes the execution source.
5. Approve only the timer once: actual report and Channel reply complete; execution settles idle and approval badges disappear.

`proof.json` contains 14 assertions executed by `scripts/e2e-orchestrator-activity.mjs` with `BH_E2E_APPROVAL_ATTENTION=true`. The runtime uses the existing authenticated API Gateway. Published captures redact only machine-local working directories in the rendered approval cards; raw payload and private authentication are not published.

Focused tests additionally exercise rejection, abort, invalidated ownership, untracking, broker disposal, commit failure and cancellation during commit, notification failure, parser safety and a new Host baseline.

This is one #123 slice: other attention kinds and explicit waiting-on-Assignment remain open.

## Final theme and real Host restart verification

`pending-light.png` and `pending-dark.png` show the final native semantic badge colors in the retained Human QA instance. The custom 14px badge follows the existing Avatar indicator and Activity Center notification pattern; larger native Pills are deliberately omitted for this geometry. Execution effects and bottom-right state dots are unchanged. Native color measurements found no `--dsw-alias-label-inverse`, so the final badge uses the defined primary-foreground token through the existing notification alias map. Focused theme/Avatar guards passed (17 assertions).

A second real concurrent run retained two approvals in the automated instance. Its exact verified Host process was stopped and cold-started with the same pinned DSH version/home; authenticated queries observed a new generation, idle and zero live approval counts while both canonical request cards remained in Channel history. `restart-proof.json` records these observations and `restarted.png` shows the restored UI. The separate Human QA Host was not restarted and retains two actionable approvals.
