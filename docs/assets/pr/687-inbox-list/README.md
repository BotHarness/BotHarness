# Compact Human Inbox — #687

After evidence was refreshed after the Human QA direct-action and detail-context changes and is unedited output from a real isolated DSH 0.2.0-rc.1 Profile pinned to the official browse picker pair, 1440×900, Chinese locale, on the linked task worktree. A fresh canonical fixture starts with 35 unread messages: three PersonaBots each have four older messages, one Workspace Grant request and four newer messages in their DM, plus eight Group updates. Concrete visible messages advance canonical read positions; badges in later captures therefore decrease. Failed E2E attempts kept their read positions and subsequent complete attempts used fresh Profiles. No model execution, mocked RPC response or copied Inbox state supplies these captures.

`before-human-qa.png` is the cropped screenshot supplied by Human QA. It documents the original spacing/filter problem at a different viewport; it is not presented as a matched full-window capture.

| Capture                                                    | Verified state                                                                                                                    |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| list-light.png / list-dark.png                             | Three compact rows, 76px high, 16px inline inset, one-line summaries and native primary actions                                   |
| native-bot-selector-dark.png                               | Native DSH Menu with selected option and current Bot choices                                                                      |
| filtered-bot-dark.png                                      | Canonical Bot filter narrows the query to Review Bot                                                                              |
| row-details-light.png / row-details-dark.png               | Clicking row text opens real source context, retains list and 16px message padding                                                |
| keyboard-details-light.png                                 | Enter activates the focused row button                                                                                            |
| primary-action-details-light.png                           | Right-side primary action opens the owning picker directly, without opening or selecting the event detail pane                    |
| list-action-picker-light.png / list-action-picker-dark.png | One list-button click opens the real DSH folder browser; cancelling and clicking again opens it again; the list remains collapsed |
| exact-source-light.png                                     | Avatar source action opens the exact original DM/message, without opening details                                                 |
| unread-channel-avatar-light.png / unread-context-light.png | Group avatar and per-Channel unread summary; row activation loads concrete context                                                |

| detail-context-light.png / detail-context-dark.png | Full-width directional context controls flush against the message flow, original pending request, and inset hover source icon |
| detail-dismissed-dark.png | Inbox item removed; two remaining requests, no expanded detail; canonical original request remains pending |

[verification.json](verification.json) records geometry and passed assertions. Native primary is the shell's own button color family, including its light/dark contrast; it does not substitute BotHarness brand tint. The source square deliberately uses token styles because the native Button capsule has different geometry. The pinned primitives export no standalone Select; filters compose native Button/Menu exactly as shell selectors do. Menu keyboard selection and Bot/Channel/sort filters were exercised through the real Host queries.

The initial Windows default native backend renders an OS folder dialog outside the browser DOM; waiting for a web dialog was the wrong E2E assertion, not evidence of a slow directory service. Final real E2E pins the official browse backend in the task-owned Profile only, preserves loopback bind, verifies the actual folder chooser after one list click and again after cancellation, and cancels without granting access. A mounted regression also verifies native-capability refusal falls back to the native picker and cancellation grants nothing. Canonical authorization submission is tested through the owning request-card callback; no real workspace grant was submitted for these screenshots.

## Reproduce

```sh
pnpm build
BH_INBOX_QA_HOME=<fresh-isolated-home> node scripts/e2e-human-inbox-list.mjs seed
node scripts/dev-instance.mjs --home <fresh-isolated-home> --port 32006 --worktree <task-worktree> --json
BH_INBOX_QA_HOME=<fresh-isolated-home> BH_INBOX_QA_PORT=32006 node scripts/e2e-human-inbox-list.mjs
```

For reproducible browser screenshots on Windows, add the supported overlay below to the task Profile's `cordis.patch.yml` and restart that exact Host before running E2E (the AX helper retains this overlay):

```yaml
- id: directory-picker
  disabled: true
- insert:
    - id: qa-directory-picker-browse
      name: '@deepseek-ai/dsh-host-directory-picker-browse'
    - id: qa-directory-picker-browse-ui
      name: '@deepseek-ai/dsh-client-ui-directory-picker-browse'
```

Seed before starting the Host; preserve the private launch log for the browser login helper. Logs/tokens and local paths are not committed. The script dismisses one Inbox item without answering, approving or granting its source request, verifies a second window and a reload, and does not mark summaries read; concrete visible context retains the canonical read behavior.

Human QA additionally requires independent click behavior: only the row button expands the event pane. Workspace actions reuse the request card as a compact control and picker; reply, question, approval and Assignment forms use a separate native Modal. Mounted regressions cover those forms without row expansion, plus cancellation followed by another window resolving the request before reopening. Reopening rechecks canonical state and does not launch a picker for a resolved request.

The upper arrow reveals only older messages and can load another canonical page; the lower arrow reveals only newer messages and can check for arrivals after a previously reached end. Both controls match the message flow width with no gap. The source icon appears on hover/focus inside each message and opens that exact placement. Dismiss persists in the owning Human Attention database preference table; Host reopen persistence, idempotency, source validation, automatic-read races and eligibility of later messages are covered by canonical SQLite/Bridge regressions. Browser evidence covers the actual command, cross-window convergence and reload; the request remains present and actionable in its original Channel.
