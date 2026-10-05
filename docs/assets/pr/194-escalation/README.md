# Assignment strong-cause acceptance (#194)

Base/runtime: `0ee4e79ef27c816a84eb43bb25257a8d73ffa365` (main after #835).
Real isolated DSH `0.2.0-rc.1`, DeepSeek Flash, low reasoning. No Shell, file tools, subagents, injected database rows or mocked UI were used. Runtime behavior is unchanged; this slice adds a reproducible backend acceptance driver, a composition regression and actual UI evidence.

## Accepted behavior

One Assignment submits four successful native `report_to_orchestrator` calls in order:
waiting-human → blocked → weaker waiting-human → informational progress.
The latest Report becomes progress, but the canonical open question stays the exact blocked Source Event. Human Inbox retains one blocked action, its original question and reply target. All four immutable Reports remain separately navigable. A Human viewing the context and opening the native Assignment does not change their state/timestamps or cause an Orchestrator Turn.

In the completed scene, the actual Inbox reply field was used to send “Use Canary for this Assignment.” Its stored Assignment reply points to the exact blocker. The same Assignment runs one additional native Turn, submits a fifth completed Report (“ESCALATION_RESOLVED: Canary”), and loses its open question/Human action. All four original sources remain. This tests answering the question only; Canary is a synthetic choice and no actual release is performed.

## Evidence

| File                         | Establishes                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| `01-pending-proof.json`      | Four distinct sources, latest progress, actionable canonical blocker, three Orchestrator Turns      |
| `02-source-view-proof.json`  | Same sources/states/handling times and Turn count after real UI source viewing                      |
| `03-answered-proof.json`     | Exact Human reply correlation, two total Assignment Turns, completion and original sources retained |
| `04-human-qa-proof.json`     | Separate unconsumed Human question; later progress remains pending under conditional wake           |
| `blocked-after-progress.jpg` | Human Inbox remains blocked while newer weaker waiting report is visible                            |
| `progress-and-reply.jpg`     | Same context scrolled to the subsequent ordinary progress                                           |
| `reply-to-blocker.jpg`       | Actual original blocked question and populated Human reply field before sending                     |
| `native-source.jpg`          | Native Assignment reached from the real source link                                                 |
| `answered-completed.jpg`     | Same scene after response: no action required and real completed Report                             |

Screenshots are actual light-theme captures at the browser's default 1280 × 720, with normal scrolling between states. They are a functional sequence, not a changed-UI before/after comparison. All were visually inspected. Public proof deliberately omits credentials, machine-local paths and raw native Session logs.

Repeat counts are verified against each batch's actual observation timestamps, not assumed to equal four in one wake. Completed scene: one Report followed by three in a batch. Human QA scene: one then two; the final progress arrives after harvest and stays pending, as conditional progress must not wake by itself. The initial driver incorrectly required every progress to be handled immediately; that assertion was corrected to distinguish pending from consumed sources, with no production policy change.

## Reproduce / Human QA

Run `scripts/dev-instance.mjs` with an isolated home/free port and this worktree, using the pinned CLI. Keep its login URL private. Set `BH_E2E_ORIGIN`, `BH_E2E_HOME`, `BH_E2E_EVIDENCE` (private output directory), optionally `BH_E2E_STATE` (private scene file), then:

```sh
node scripts/e2e-assignment-escalation.mjs prepare
```

The driver uses only authenticated API/native Session snapshots; it does not automate the browser or publish evidence. In the real UI open **Activity Center → Inbox → Needs my action → Respond to Assignment**. Read newer Reports, open **Open Assignment Session**, return to the Inbox and run `verify` to check source-view invariance. Reply **Use Canary for this Assignment.** in that original question's reply field and run `answered` to verify actual resume/completion. `pending` refreshes a read-only baseline for an existing private scene; use `verify` for before/after invariance.

A second Bot **Escalation QA 1791182162904** is left unanswered for Human QA. Its blocked source, rather than later progress, is the reply target. The private local QA guide contains the login link; no secret is committed here.

This PR remains a bounded #194 acceptance slice. Failure/interruption, Needs repair protection and active/observed execution crash repair are not established by this run; #194 stays open.
