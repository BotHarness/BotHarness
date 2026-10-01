# Activity Center entry — #679

These unedited screenshots compare main `358991db74b4b3e199e104ccd6384756d846a318` with this PR on isolated DSH 0.2.0-rc.1 with the same 1440×900 viewport, Chinese locale and canonical fixture. Both use three QA Bots, a canonical Group containing 110 seeded Bot updates and one canonical DM Workspace Grant request: 111 unread messages and one independent action. Before captures used the first QA Profile. After Human QA marked those messages read, the final populated screenshots use a fresh isolated Profile seeded with the same fixture, preserving Human read positions. The qa-before-* images retain the preceding PR revision for the badge/dot comparison. The fixtures exercise existing Channel / Human attention authorities; they are deterministic QA messages, not new model executions or copied Inbox state.

| Before                               | After                         | Scenario                                                                                              |
| ------------------------------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| before-expanded-light.png            | expanded-overview-light.png   | Expanded sidebar, light theme: full-width row becomes icon + 99+ chip left of settings                |
| before-expanded-dark.png             | expanded-overview-dark.png    | Same expanded sidebar in dark theme                                                                   |
| before-collapsed-light.png           | collapsed-light.png           | Collapsed sidebar, light theme: 36×36 icon below Bot mode with 4px gap, red dot only at the top-right |
| before-collapsed-dark.png            | collapsed-dark.png            | Same collapsed sidebar in dark theme, matching native 12px radius, no numeric badge                   |
| before-remembered-inbox-reloaded.png | remembered-inbox-reloaded.png | Select Inbox, visit DM, re-open and reload: previously Overview, now remembered Inbox                 |
| before-native-mode-dark.png          | native-mode-dark.png          | Native DSH mode: previously absent, now the same compact entry remains reachable                      |

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

## Human QA refinements

Expanded has only the unread badge and stays visible while unread exists. With zero unread, the entry is hidden at rest; only while Bot mode is active, hovering its button or keyboard focus reveals it, and moving the pointer onto the revealed entry keeps it clickable. Collapsed retains the aligned icon only while Bot mode is active, and shows only one top-right red dot for unread or action attention. With Bot mode off, collapsed is hidden even with unread. Expanded with zero unread also stays hidden on hover while mode is off; these hidden entries are excluded from the tab order and accessibility tree. No blue action dot or collapsed numeric badge remains. The accessible name still reports full unread count and action attention.

| Screenshot                                                                   | State                                                              |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| empty-hidden-light.png / empty-hidden-dark.png                               | Real separate empty Profile: no unread, entry hidden without hover |
| empty-hover-light.png / empty-hover-dark.png                                 | Same empty Profile after hovering Bot mode                         |
| empty-keyboard-focus-light.png                                               | The empty entry reached using Tab, with a visible focus outline    |
| qa-before-expanded-overview-light.png / qa-before-expanded-overview-dark.png | Prior PR revision with unread badge and duplicate blue dot         |
| qa-before-collapsed-light.png / qa-before-collapsed-dark.png                 | Prior PR revision with collapsed numeric badge and blue dot        |

[empty-verification.json](empty-verification.json) records real zero-unread assertions: hidden at rest, hover reveal, clickable pointer transfer and keyboard reveal. The populated verification records badge-only expanded rendering, dot-only collapsed rendering and the measured top-right position and red DSH token color.

To reproduce empty-state checks, launch a second fresh isolated home without seeding, then run:

```sh
BH_ENTRY_QA_HOME=<empty-isolated-home> BH_ENTRY_QA_PORT=32004 node scripts/e2e-activity-entry.mjs empty
```

| Additional mode-off evidence                                 | State                                                                        |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| empty-off-hover-light.png / empty-off-hover-dark.png         | Expanded, zero unread, Bot mode OFF: hovering Bot mode does not reveal Inbox |
| empty-off-collapsed-light.png / empty-off-collapsed-dark.png | Collapsed, zero unread, Bot mode OFF: Inbox hidden                           |
| collapsed-off-light.png / collapsed-off-dark.png             | Collapsed, 111 unread, Bot mode OFF: Inbox still hidden                      |

The final real-browser checks also assert hidden controls cannot enter the tab order and that expanded unread attention remains reachable from native DSH mode by keyboard.
