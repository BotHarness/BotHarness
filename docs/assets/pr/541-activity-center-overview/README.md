# Activity Center Overview — #541 first tracer

Real DSH 0.2.0-rc.1, Windows, an isolated task Profile; no mock API or manually drawn UI.
Locale: Chinese. Desktop: 1440 × 900. Narrow: 420 × 860. Screenshots are unedited.

## Before / after

The prior Human Inbox has no Overview screen. Its merged Client at `45be9fe8`
(PR #669 reviewed head) supplies the absence/entry baseline. Implementation starts
from main `917ee190` and integrates main `0ada01e2` before delivery. The Inbox entry being compared is unchanged between
those revisions; unrelated Profile UI changes are outside these captures.
The matched pairs use the same six-Bot Profile after cold restart, viewport, theme
and locale. No model work or Human answer is submitted between the pair captures.

| State         | Before                                 | After                           |
| ------------- | -------------------------------------- | ------------------------------- |
| Light desktop | [Inbox entry](before-inbox-light.png)  | [Overview](overview-light.png)  |
| Dark desktop  | [Inbox entry](before-inbox-dark.png)   | [Overview](overview-dark.png)   |
| Narrow        | [Inbox entry](before-inbox-narrow.png) | [Overview](overview-narrow.png) |

## Real model / native Session scenario

A separate timed scene has four Bots. DeepSeek creates one root Assignment and
runs one native PowerShell timer in that Assignment and another in its
Orchestrator. Commands only wait 90 seconds and print distinct QA markers.
Both native tool calls are explicitly approved once via the existing Inbox path.

- [Waiting for native approvals](overview-waiting-approvals.png): waiting roots do not enter the executing list.
- [Both roots executing, light](overview-executing-light.png) / [dark](overview-executing-dark.png).
- [Orchestrator opened in native DSH](overview-native-orchestrator.png).
- [Assignment opened in native DSH](overview-native-assignment.png).
- [Completed work removed](overview-work-completed.png).
- [Bot card opens its DM](overview-bot-dm.png).
- [Action count opens existing action list](overview-inbox-actions.png).
- [Cold restart](overview-restarted.png): six stable Bot IDs survive, historical executions do not reappear.

The final four actions are canonical attention-repair requests from the interrupted
QA run; they are different from the 15 unread messages. Expired native question
requests are not counted as live actions. The waiting and executing screenshots
were taken before the subsequent cold restart.

## Checks and reproduction

`scripts/e2e-activity-overview.mjs` uses the real task Host RPC and native UI.
After launching an isolated Profile with `scripts/dev-instance.mjs`, supply its
home and port with `BH_OVERVIEW_QA_HOME` and `BH_OVERVIEW_QA_PORT`.
Run `work` on a fresh task Profile for model execution and precise native navigation;
`check` creates native questions and verifies count/DM/Inbox/responsive behavior;
`snapshot` captures existing facts without starting models; `resume` checks a
previously saved scene after restarting that same Host.

Passed assertions: unpaged count equals canonical action query, waiting excluded,
two executing root roles, native requests contain the exact clicked Session ID,
Bot DM title matches, completed roots leave the list, restart preserves Bot IDs,
no historical execution after restart, light/dark/narrow render without horizontal
overflow. Measured native content: 24px desktop inset, 13px inherited shell font,
8px native-row radius. A live pagination regression check forced a page size of one:
four pages yielded four canonical actions, exactly matching Overview; the script
follows `nextCursor` instead of comparing only the first page.

The first reused native-question scene did not produce a new question after a
restart, so fresh task Bots were used for the live-question check. This PR does not
change native question resumption; that limitation is separate from the Overview
read projection.

Focused automated regression: 81 tests across nine relevant files passed, including
pending brokers, canonical attention, sidebar, Overview and late responses. Type
checking, lint and modified-file formatting passed. Full Linux verification runs
in the PR CI; Windows whole-repository formatting reports pre-existing checkout
CRLF differences, which are not rewritten by this change.

Human QA: open Bot mode → Activity Center → Overview, compare count with the
Needs action list, click a Bot to its DM, and use the timed scene to click both
Session roles into native DSH. Return to Overview after completion and after restart.
Channel activity charts, token trends and Memory metrics remain #541 expansion
work after first-slice QA; this PR references rather than closes the full issue.
