# Compact Human Inbox — #687

After evidence is unedited output from a real isolated DSH 0.2.0-rc.1 Profile, 1440×900, Chinese locale, on the linked task worktree. The canonical fixture has three PersonaBots, one Workspace Grant request in each DM, and eight Group updates. Earlier script attempts opened concrete messages; their canonical read positions were preserved, so screenshot badges do not claim all eleven messages remain unread. No model execution, mocked RPC response or copied Inbox state supplies these captures.

`before-human-qa.png` is the cropped screenshot supplied by Human QA. It documents the original spacing/filter problem at a different viewport; it is not presented as a matched full-window capture.

| Capture                                                    | Verified state                                                                                  |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| list-light.png / list-dark.png                             | Three compact rows, 76px high, 16px inline inset, one-line summaries and native primary actions |
| native-bot-selector-dark.png                               | Native DSH Menu with selected option and current Bot choices                                    |
| filtered-bot-dark.png                                      | Canonical Bot filter narrows the query to Review Bot                                            |
| row-details-light.png / row-details-dark.png               | Clicking row text opens real source context, retains list and 16px message padding              |
| keyboard-details-light.png                                 | Enter activates the focused row button                                                          |
| primary-action-details-light.png                           | Right-side primary action independently opens the request card                                  |
| exact-source-light.png                                     | Avatar source action opens the exact original DM/message, without opening details               |
| unread-channel-avatar-light.png / unread-context-light.png | Group avatar and per-Channel unread summary; row activation loads concrete context              |

[verification.json](verification.json) records geometry and passed assertions. Native primary is the shell's own button color family, including its light/dark contrast; it does not substitute BotHarness brand tint. The source square deliberately uses token styles because the native Button capsule has different geometry. The pinned primitives export no standalone Select; filters compose native Button/Menu exactly as shell selectors do. Menu keyboard selection and Bot/Channel/sort filters were exercised through the real Host queries.

The optional attempt to open the existing native directory picker did not finish in 30 seconds on this Windows Host. No workspace authorization or picker completion is claimed here. This slice verifies opening the actual grant card through its primary action; the existing grant/approval/question/Assignment response regressions still pass. Folder Provider performance is outside the changed code.

## Reproduce

```sh
pnpm build
BH_INBOX_QA_HOME=<fresh-isolated-home> node scripts/e2e-human-inbox-list.mjs seed
node scripts/dev-instance.mjs --home <fresh-isolated-home> --port 32006 --worktree <task-worktree> --json
BH_INBOX_QA_HOME=<fresh-isolated-home> BH_INBOX_QA_PORT=32006 node scripts/e2e-human-inbox-list.mjs
```

Seed before starting the Host; preserve the private launch log for the browser login helper. Logs/tokens and local paths are not committed. The script does not submit decisions or mark summaries read; concrete visible context retains the canonical read behavior.
