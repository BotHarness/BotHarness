# Assignment Report batches and source history

This guide records a narrow [#194](https://github.com/BotHarness/BotHarness/issues/194) acceptance verified on DSH 0.2.0-rc.1 with a real model. Assignment Reports are application-defined durable Source Events, admitted to the owning PersonaBot's Bot Inbox; see the [architecture](../../architecture/botharness-architecture.md). The Host owns source policy, ready-set harvest and observation.

## Human workflow

1. Ask an authorized PersonaBot to create one Assignment that reports two progress milestones, then waits at a harmless tool approval before reporting completion.
2. Open the Channel sidebar's Bot Inbox. Both progress items remain separate, pending and navigable. Under the default Conditional Assignment Report policy, these informational progress reports do not start another Orchestrator Turn.
3. Click a progress item to open its owning native DSH Session. Viewing is not Bot observation or a new wake; return to Bot mode afterward.
4. Allow the prepared tool once. The Assignment submits its completed Report, and the Orchestrator harvests the pending batch and replies in the original DM.
5. In Bot Inbox, expand the Assignment group and its handled history. Both progress items and completion remain separate, handled source facts. Refresh and open any source again.

For this prepared scene the native tool is a one-second Node timer, with no file change. Single-use approval is a QA action, not an Assignment-owned privilege.

## Verified behavior

| Phase                               | Native execution                                                                                                  | Durable source projection                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Two progress reports, timer pending | One initial Orchestrator Turn; no progress wake                                                                   | Two independent pending progress sources                                                     |
| Completion after one-time approval  | Exactly one additional harvest Turn and one model-visible Inbox delivery, with `repeats 3` and the latest summary | Three independent IDs, one observation time and one handling time; all handled and navigable |
| Human opens a source                | Actual authenticated native `session/follow` for the owning Session                                               | Viewing leaves source states/observation unchanged and starts no Orchestrator Turn           |

The Assignment's three `report_to_orchestrator` calls have successful native Session results. Every completion DM marker follows the successful completed Report result. Complete native snapshots, rather than reply counts, establish the Turn/delivery assertions.

[Actual screenshots and public proof](https://github.com/BotHarness/BotHarness/blob/main/docs/assets/pr/194-report-harvest/README.md) record this run. The existing production path passed; this change adds evidence and reproducible checks. It does not close #194 or verify Report/Lifecycle Notice pairing, strong-cause escalation, interruption or active-turn restart recovery; the pending-progress cold restart case is verified below. Capacity and answer-delivery settlement remain separately owned.

## Agent reproduction

Launch a fresh isolated Profile with `scripts/dev-instance.mjs`. Set `BH_E2E_ORIGIN` to its loopback URL, `BH_E2E_HOME` to its home and `BH_E2E_EVIDENCE` to a private directory, then run:

```bash
node scripts/e2e-assignment-report-harvest.mjs prepare
node scripts/e2e-assignment-report-harvest.mjs complete
```

`prepare` uses real Orchestrator/Assignment model requests, checks pending sources and captures the actual UI. `complete` makes the one-time timer approval through the authenticated Human Gateway, verifies native Reports and the batch, then captures handled history. `verify` repeats completed read-only checks and capture; `capture` only repeats UI/source-navigation checks. Neither read-only mode starts a model request.

Credentials, raw Session content, tool arguments/results, machine paths and login URLs stay private. Public records include bounded QA markers, source IDs, native result times and verified outcomes. Screenshots show the real Profile with the selected Assignment's Bot Inbox, keeping approval arguments outside the captured view.

## Pending reports across Host restart

A second real DSH 0.2.0-rc.1 run verifies two informational progress Reports from one settled Assignment across a cold Host restart, under the built-in Conditional source policy:

| Boundary                                  | Verified result                                                                                                                                          |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before restart                            | Two distinct unobserved progress Sources; Assignment idle; one settled Orchestrator Turn                                                                 |
| Fresh Host process, same isolated Profile | Same Assignment and Orchestrator Session IDs, same Source IDs/content/creation times, both still pending and navigable; no replay Turn or Inbox delivery |
| Next Human DM                             | One new Turn harvests the two original sources once, with latest summary and repeats 2; both handled in one batch                                        |
| Human opens a source                      | Authenticated native Session navigation; no observation change or extra Turn                                                                             |

This applies to quiet pending progress from a settled Assignment. It does not establish crash recovery of an active/observed Turn, failure/escalation or terminal Report/Lifecycle Notice causal pairing. [Actual restart screenshots and proof](https://github.com/BotHarness/BotHarness/blob/main/docs/assets/pr/194-report-restart/README.md).

For agent reproduction, use a fresh isolated Profile and the same three environment variables above:

```bash
node scripts/e2e-assignment-report-restart.mjs prepare
# Stop only this launcher's verified Host PID, then relaunch the same home/port.
node scripts/e2e-assignment-report-restart.mjs after-restart
node scripts/e2e-assignment-report-restart.mjs harvest
node scripts/e2e-assignment-report-restart.mjs verify
```

The restart is an explicit operator action outside the verification script. Keep both launch records private and verify the replacement PID and authenticated API before continuing; do not kill shared processes. No model/tool request runs during after-restart or verify. The harvest phase sends one real Human DM; it creates no Assignment and uses no Shell/file operation. Capture mode only reads current state and exercises source navigation. Optional BH_E2E_STATE selects a private scene file when verifying an earlier scene without replacing the pending Human QA scene.

For Human QA, open the prepared post-restart Bot, inspect both pending progress markers and open one source, then return to the Bot DM and send RESTART_HARVEST. The Bot replies RESTART_REVIEWED; both original entries remain in handled history after refresh. Tokens consumed by the actual QA model requests are normal recorded usage.
