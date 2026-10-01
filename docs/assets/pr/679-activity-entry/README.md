# Activity Center entry — #679

These unedited screenshots compare main `358991db74b4b3e199e104ccd6384756d846a318` with this PR on the same isolated DSH 0.2.0-rc.1 Host, Profile, 1440×900 viewport and Chinese locale. Both use three QA Bots, a canonical Group containing 110 seeded Bot updates and one canonical DM Workspace Grant request: 111 unread messages and one independent action. Only the served Client bundle changed for the Before captures. The fixtures exercise existing Channel / Human attention authorities; they are deterministic QA messages, not new model executions or copied Inbox state.

| Before                               | After                         | Scenario                                                                               |
| ------------------------------------ | ----------------------------- | -------------------------------------------------------------------------------------- |
| before-expanded-light.png            | expanded-overview-light.png   | Expanded sidebar, light theme: full-width row becomes icon + 99+ chip left of settings |
| before-expanded-dark.png             | expanded-overview-dark.png    | Same expanded sidebar in dark theme                                                    |
| before-collapsed-light.png           | collapsed-light.png           | Collapsed sidebar, light theme: 36×36 icon below Bot mode with 4px gap                 |
| before-collapsed-dark.png            | collapsed-dark.png            | Same collapsed sidebar in dark theme, matching native 12px radius                      |
| before-remembered-inbox-reloaded.png | remembered-inbox-reloaded.png | Select Inbox, visit DM, re-open and reload: previously Overview, now remembered Inbox  |
| before-native-mode-dark.png          | native-mode-dark.png          | Native DSH mode: previously absent, now the same compact entry remains reachable       |

`expanded-inbox-light.png` shows the top Inbox tab and Group unread summary. `settings-independent.png` shows the settings opening independently of the Chip and mode button.

[verification.json](verification.json) records the canonical count and measured geometry. Browser assertions also cover native-mode Enter, Chip Space, explicit Overview selection, collapse/expand, and independent settings; the mounted Client regression covers zero-unread pending actions and listener/portal cleanup.

## Reproduce

Use the task worktree's supported Node / pnpm and a new isolated home:

```sh
pnpm build
BH_ENTRY_QA_HOME=<isolated-home> node scripts/e2e-activity-entry.mjs seed
node scripts/dev-instance.mjs --home <isolated-home> --port 32003 --worktree <task-worktree> --json
BH_ENTRY_QA_HOME=<isolated-home> BH_ENTRY_QA_PORT=32003 node scripts/e2e-activity-entry.mjs
```

Seed before starting the Host. A rerun reads the live canonical count and still requires more than 99 unread messages. The one-shot login URL stays private in the isolated launch log. The browser script explicitly selects dark theme for native-mode capture and light/dark for later captures. No screenshot was post-processed.
