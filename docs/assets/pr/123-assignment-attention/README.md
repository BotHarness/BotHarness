# Assignment Human attention — real isolated DSH evidence

Refs #123. Task: `codex/local/01a0e445-0c0f-70e1-bad4-fd99c8cfaa21`.

One shared Host Activity projection derives waiting-human and blocked Assignment counts from the existing Human action query. The original report, addressed response, dismissal and stop predicates remain canonical; no second pending-request store or Session lifecycle is added.

## Runtime verification

- Isolated DSH 0.2.0-rc.1, Node 24.21.0. Real model-created Assignment and `report_to_orchestrator`; no synthetic SessionEvents or direct report/database injection.
- A real `waiting-human` report with `expects_reply` settles both Turns to idle. Sidebar and composer retain a red 1 and a distinct waiting-for-you summary. Overview agrees with the queried snapshot. Execution stays idle, without a fabricated running animation.
- Browser reload keeps the same Activity revision and count. While the browser is offline, an authenticated addressed Human response commits through the existing Channel command. Reconnect receives the new baseline without a reload, clears the count, and the real Assignment resumes and reports completed.
- A real blocked report shows a separate blocked count. The Orchestrator invokes `stop_assignment`; native work is stopped, the canonical Human action disappears and the shared count clears.
- A verified isolated Host process is stopped and restarted with the same home/source. A new Activity generation reconstructs the unresolved durable report as idle plus waitingHumanCount=1. An actual Human response after restart resumes that Assignment and reaches completed.
- A separate fresh pending Assignment is retained for Human QA after recovery proof. Its name and authenticated one-shot URL are provided only in chat.

## Evidence

| Capture                                                                              | Observation                                                            |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| [Waiting, light](assignment-waiting-light.png) / [dark](assignment-waiting-dark.png) | Same independent count in sidebar and composer                         |
| [Overview](overview-assignment-waiting.png)                                          | Shared Host count alongside the canonical response action              |
| [Reconnected and completed](reconnected-answer-completed.png)                        | Offline answer clears attention and actual Assignment completes        |
| [Blocked](assignment-blocked.png) / [stopped](blocked-stopped.png)                   | Real report and real stop clear the owning action                      |
| [After Host restart](restarted-durable-waiting.png)                                  | Durable pending report survives; historical execution does not animate |
| [Post-restart completion](restart-answer-completed.png)                              | Actual addressed response still resumes Assignment                     |
| [Human QA pending](human-qa-pending-assignment.png)                                  | Separate live pending report for acceptance                            |

[Runtime proof](proof.json) and [restart proof](restart-proof.json) contain only safe Activity frames and assertions, not authentication, raw SessionEvents, tool payloads or local paths.

## Test boundary and remaining scope

Focused Host tests use public report/Channel/stop operations and canonical dismissal; cover independent native counts, no-change revisions and durable reconstruction. Client tests reject unsafe or overflowing counts and render idle/working attention independently. Windows filesystem/Memory startup makes the two Host integration cases slower; each has a 60-second limit. Full Linux CI is the complete test gate.

Explicit waiting-on-Assignment execution signaling, informational attention and other sources remain #123 follow-up slices. #124 and #505 are deferred. This PR does not add a new Human Inbox UI or new polling.

## Reproduce

Launch a fresh isolated home with `scripts/dev-instance.mjs`. Set `BH_E2E_ORIGIN`, `BH_E2E_HOME` and `BH_E2E_EVIDENCE`, then run `node scripts/e2e-assignment-attention.mjs`. Restart only the verified task-owned Host using the same source/home, then run the script with `restarted`. The script saves raw fixture identity and failure diagnostics only under the private task directory.
