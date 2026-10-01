# Activity Center entry — #679

These are unedited screenshots from real isolated DSH 0.2.0-rc.1. Before is the reviewed #676 Overview screenshot with the previous full-width Activity Center row. After uses a fresh task-local Profile with three QA Bots, a canonical Group containing 110 seeded Bot updates and one canonical DM Workspace Grant request: 111 unread messages and one independent action. The fixtures exercise existing Channel / Human attention authorities; they are deterministic QA messages, not new model executions or copied Inbox state.

| Screenshot                                               | Scenario                                                 |
| -------------------------------------------------------- | -------------------------------------------------------- |
| before-expanded.png                                      | Previous full-width entry, reviewed #676 runtime         |
| expanded-overview-light.png / expanded-overview-dark.png | Compact icon + 99+ chip immediately left of settings     |
| expanded-inbox-light.png                                 | Inbox from the top tabs, with Group unread summary       |
| remembered-inbox-reloaded.png                            | Visit DM, re-open Inbox, reload and return to Inbox      |
| collapsed-light.png / collapsed-dark.png                 | 36×36 icon below the 36×36 Bot button; 4px gap           |
| settings-independent.png                                 | Settings opens independently of the Chip and mode button |

[verification.json](verification.json) records the canonical count and measured geometry. Browser assertions also cover native-mode Enter, Chip Space, explicit Overview selection, collapse/expand, and independent settings; the mounted Client regression covers zero-unread pending actions and listener/portal cleanup.

## Reproduce

Use the task worktree's supported Node / pnpm and a new isolated home:

```sh
pnpm build
BH_ENTRY_QA_HOME=<isolated-home> node scripts/e2e-activity-entry.mjs seed
node scripts/dev-instance.mjs --home <isolated-home> --port 32003 --worktree <task-worktree> --json
BH_ENTRY_QA_HOME=<isolated-home> BH_ENTRY_QA_PORT=32003 node scripts/e2e-activity-entry.mjs
```

Seed before starting the Host. A rerun reads the live canonical count and still requires more than 99 unread messages. The one-shot login URL stays private in the isolated launch log. No screenshot was post-processed.
