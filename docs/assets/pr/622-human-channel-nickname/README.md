# Human Channel nickname QA

Genuine DSH scene for #622, using one PersonaBot and one local Human with stable `local-human` identity. The plugin default is **小熊 新**, the Navigator QA DM uses **船长**, and **Roleplay nicknames QA** uses **教授**. **Default name QA** inherits the plugin default.

The screenshots come from the actual settings/header menu, historical Channel messages, personal Inbox and a real model reply. The Bot discovered current Human member names through Channel tools and replied `QA_VISIBLE: DM=船长; Group=教授; ID=local-human`. Original Group Source Event body/mention spans and attention were compared around renaming, and two browser windows converged. A cold Host restart reconstructed overrides and inheritance.

## Human QA

1. Open the task's isolated DSH on port 31991, then Bot mode.
2. Open Navigator QA DM → top-right Channel menu → My nickname. Confirm 船长, change it, or restore the default.
3. Open Roleplay nicknames QA → the same menu. Confirm 教授; the historical trusted Human mention uses this name.
4. Open Inbox → Mentions and replies → Reply on the Group mention → nearby messages. Author and typed @ labels use the Group nickname.
5. Restore the Group default: it becomes 小熊 新, while the DM remains independent. Changing the plugin default updates only inheriting Channels.

## Evidence

- [DM editor](edit-dm.png), [Group editor](edit-group.png)
- [Researcher](after-researcher.png), [Professor light](after-group-light.png), [Professor dark](after-group-dark.png)
- [Inbox light](after-inbox-light.png), [Inbox dark](after-inbox-dark.png)
- [Inherited name](after-inherit.png), [narrow layout](after-narrow.png)
- [Real Bot current-name discovery](after-bot-context.png), [cold restart](after-restart.png)
- [Machine-readable result](results.json)

## Runnable verifier

Build this worktree, launch `scripts/dev-instance.mjs` with a task-owned home and port 31991, then run `node scripts/e2e-human-channel-names.mjs`. Restart that same isolated Host and run the verifier with `restart`; `reset` checks the restore-default button separately. Optional `BH_NAMES_QA_HOME` and `BH_NAMES_QA_EVIDENCE` override task-local defaults. Login URLs, credentials, process logs and prepared scene JSON are private and excluded from these artifacts.
