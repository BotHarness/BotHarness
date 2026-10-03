# #123: Active Orchestrator presentation

Real isolated DSH 0.2.0-rc.1 with a Human-selected DeepSeek V4 Pro/off model route.
No mock Session or injected Activity state was used. Machine-local working directories
are explicitly redacted in the rendered screenshots.

## Observed path

1. Real Orchestrator creates one Workspace-Grant-backed Assignment, then calls
   native `browser_tabs` with `action=list`; the Assignment calls native Shell
   (`pwsh` on this Windows Host) for a harmless two-second Node timer.
2. Both native approvals remain pending. The shared Activity selects Orchestrator
   and only its Tool detail; the expanded list still shows both Session rows.
3. Reload reconnects through the existing authenticated API Gateway. The queried
   generation/revision/current snapshot stays identical, and disclosure defaults closed.
4. Approving the browser call once lets Orchestrator finish its Turn. Presentation
   hands off to the remaining Assignment Shell activity across sidebar and composer.
5. Approving the timer once produces a real Assignment report, an Orchestrator
   Channel reply `Concurrent activity confirmed`, and idle with no stale Activity region.

- [Orchestrator selected](orchestrator-selected.png)
- [Assignment selected after Orchestrator completion](assignment-selected.png)
- [Reconnected and expanded](reconnected.png)
- [Real reply and idle](settled.png)
- [Nine observed assertions](proof.json)

## Reproduce

Start a fresh isolated instance linked to this worktree with `scripts/dev-instance.mjs`.
Set `BH_E2E_ORIGIN`, `BH_E2E_HOME`, and `BH_E2E_EVIDENCE`, then run
`node scripts/e2e-orchestrator-activity.mjs`. `BH_E2E_HOLD=true` leaves both
safe approvals pending for Human QA. Only exact `browser_tabs/list` and the exact
harmless timer call are approved once by this verifier; no saved approval rule is added.

This first tracer bullet retains #123 for explicit waiting-on-Assignment signaling
and complete orthogonal Human attention. Existing multi-Assignment Tool aggregation
and individual safe Session rows remain authoritative Host projections.
