# Human Inbox: Grant and Assignment actions

Issue: [#552](https://github.com/BotHarness/BotHarness/issues/552), part of [#126](https://github.com/BotHarness/BotHarness/issues/126).

## Real scenario

Two PersonaBots request a project folder. The Human selects and authorizes one folder from Inbox; its request resolves and the real Orchestrator acknowledges the active Grant. The other request stays pending.

The authorized Bot creates an Assignment which asks the Human to choose a release route. The Human sees the exact report, can expand its purpose and nearby reports, and replies in Inbox. The canonical Bot DM records the owning Assignment Session and report reference; the real Orchestrator relays the answer, and the Assignment reports completion. The action disappears from the canonical projection. Opening the Session returns to the original DSH conversation.

A second, blocked Assignment is opened in two independent browser windows. The second window submits `stable`; the first window's stale `canary` submit is refused. Both display the committed answer, exactly one addressed DM message exists, and the real Assignment continues to completion. A fresh unanswered `HUMAN_QA` report and an independent Grant request remain for Human QA.

## Evidence

Captured from the task's isolated DSH 0.2.0 RC1 Profile with a real DeepSeek model on 2026-10-01; the screenshots are unedited.

| Behavior                                                  | Capture                                                                                |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Inbox Grant source and nearby-context control             | [Light](grant-light.png), [dark](grant-dark.png)                                       |
| Explicit Human folder selection                           | [Folder picker](folder-picker.png)                                                     |
| Grant-linked reply committed; independent requests remain | [Inbox](grant-answered.png), [original DM](grant-source-resolved.png)                  |
| Waiting Assignment, source identity and reply             | [Light](assignment-waiting-light.png), [dark](assignment-waiting-dark.png)             |
| Expand canonical report context and full purpose          | [Context](assignment-context.png)                                                      |
| Addressed reply committed                                 | [Reply](assignment-replied.png)                                                        |
| Exact original DSH Session and real continuation          | [Session](assignment-native-session.png)                                               |
| Blocked Assignment and concurrent stale refusal           | [Blocked](assignment-blocked.png), [committed answer](assignment-concurrent-stale.png) |
| Narrow viewport retains the reply controls                | [420px](assignment-narrow.png)                                                         |
| Runnable Human QA state                                   | [Before restart](human-qa-ready.png), [after restart](after-restart-qa-ready.png)      |

Dark captures exercise the native theme attribute; they do not claim persistence of a changed theme setting. The browser Profile explicitly uses the existing DSH browse directory picker; unavailable native browsing falls back to the native picker in the Client, with automated coverage of selection and cancellation.

## Human QA

1. Open the task's running Profile, enter Bot mode, then Inbox → **需要我处理**.
2. Filter to the latest `InboxGrantQA` Bot, open the `HUMAN_QA` item, expand context, and send `canary` or `stable`.
3. Verify the reply appears in that Bot's DM and the Assignment eventually completes. Click **打开 Assignment Session** to inspect the native conversation; click the Bot to return to its private chat.
4. Open the latest `IndependentGrantQA` request and choose a disposable project folder. Confirm that only the selected Bot receives access and that its request resolves.

## Reproduce and regression boundaries

Launch an isolated Profile with `scripts/dev-instance.mjs`, using this worktree and the selected port. For browser QA on Windows, apply the task-local browse picker overlay described in the [DSH development guide](../../../../.agents/skills/dsh-dev/SKILL.md), then restart that exact Host. Set `BH_ACTION_QA_HOME` and `BH_ACTION_QA_PORT` to this Profile and run:

```text
node scripts/e2e-inbox-grant-assignment.mjs
```

Restart the same Host and run:

```text
node scripts/e2e-inbox-grant-assignment.mjs resume
```

The first run checks canonical Grant access, linked replies, independent requests, waiting/blocked real model continuation, exact Session navigation, single concurrent commitment and narrow controls. The second verifies the unresolved Grant and `HUMAN_QA` report survive restart and remain answerable. Private scene IDs and launch credentials are kept outside committed evidence.

Focused Host/Bridge tests cover foreign or stale source refusal, stopped work, atomic concurrent replies, restart, severity preservation and canonical Grant validation. Client tests cover the source actions, addressed response, picker fallback/cancellation, failed confirmation and unavailable navigation. Typecheck, lint and build also pass locally; the PR's Linux verification job is the full-suite gate. Windows has pre-existing attachment-fsync failures and checkout-wide CRLF format differences, so those full checks are delegated to Linux CI.
