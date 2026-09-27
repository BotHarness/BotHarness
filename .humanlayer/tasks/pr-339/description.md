Refs #116 | [Agent claim](https://github.com/BotHarness/BotHarness/issues/116#issuecomment-5848670466) | [Final matrix](https://github.com/BotHarness/BotHarness/issues/116#issuecomment-5853810570) | Task: `codex/local/01a0cde3-1621-7382-96a1-852758cedfc0`

## Why the change

People need to see which existing Assignment Sessions still have full file access after they turn off the Bot's default or restart DSH.

## Special things to note

- The warning comes from each Assignment's immutable permission snapshot; changing the Bot default never rewrites an existing Session.
- Real DSH and live-model checks covered safe and full-access Assignments, Host restart, old-Grant rejection, new-Grant recovery, and rejection when resuming an old full-access Session after regrant; Human QA passed. The full Linux suite passed (1,078 tests), along with build, typecheck, lint, and formatting of every changed PR file.
- Full-tree formatting still reports unrelated baseline files; this PR changes none of them.

## Change outline

```text
Assignment Directory: durable permission.mode snapshot
  → Host sessions() projection: assignmentAccessMode
  → Client parser and Session row model
  → Channel Sessions list: persistent warning for full-access Assignments
```

The Host and Client tests pin the snapshot projection and prevent an Orchestrator row from inheriting an Assignment warning.
